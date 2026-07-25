import json
import asyncio
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.database import get_db
from app.models.models import TokenUsage
from app.models import state
from app.services.agent_service import process_agent_stream, generate_warning_audio, generate_live_scores
from app.services.tts_service import generate_full_audio_from_text
from app.workers.assessor import evaluate_candidate

router = APIRouter()

async def send_live_eval(websocket: WebSocket, messages: list, job_title: str):
    scores = await generate_live_scores(messages, job_title)
    if scores:
        try:
            await websocket.send_json({"type": "live_scores", "scores": scores})
        except:
            pass

@router.websocket("/{session_id}")
async def websocket_endpoint(websocket: WebSocket, session_id: str, db: AsyncSession = Depends(get_db)):
    await websocket.accept()
    if not state.client:
        await websocket.send_json({"type": "error", "message": "Aegra client not initialized"})
        await websocket.close()
        return
        
    session_totals = {"prompt": 0, "completion": 0, "latency_sum": 0, "turns": 0}
        
    try:
        try:
            state_resp = await state.client.threads.get_state(session_id)
        except Exception:
            await websocket.send_json({"type": "error", "message": "Invalid session_id"})
            await websocket.close()
            return
            
        current_values = state_resp["values"]
        initial_config = state.pending_sessions.get(session_id, {})

        async def send_delta(delta: str):
            await websocket.send_json({"type": "text_delta", "delta": delta})

        # We manually trigger the interviewer node for the first question
        if not current_values.get("messages") and initial_config:
            new_state, final_text = await process_agent_stream(session_id, initial_config, send_delta)
            
            # Send telemetry
            telemetry = new_state.get("telemetry", {})
            if telemetry:
                session_totals["prompt"] += telemetry.get("prompt_tokens", 0)
                session_totals["completion"] += telemetry.get("completion_tokens", 0)
                session_totals["latency_sum"] += telemetry.get("latency_ms", 0)
                session_totals["turns"] += 1
                
                await websocket.send_json({
                    "type": "telemetry",
                    "prompt_tokens": telemetry.get("prompt_tokens", 0),
                    "completion_tokens": telemetry.get("completion_tokens", 0),
                    "latency_ms": telemetry.get("latency_ms", 0)
                })

        while True:
            data = await websocket.receive_text()
            
            try:
                payload = json.loads(data)
                msg_type = payload.get("type", "message")
                content = payload.get("content", "")
            except:
                msg_type = "message"
                content = data

            state_resp = await state.client.threads.get_state(session_id)
            current_state = state_resp["values"]
            
            if msg_type == "change_language":
                await state.client.threads.update_state(session_id, values={"language": content})
                continue
            elif msg_type == "tab_switch":
                new_cheat = current_state.get("cheat_signals", 0) + 1
                await state.client.threads.update_state(session_id, values={"cheat_signals": new_cheat})
                
                language = current_state.get("language", "en")
                warning_text = "يرجى الانتباه، لقد تم رصد تبديل للنافذة. نرجو الحفاظ على التركيز في المقابلة." if language == "ar" else "Please remain focused on the interview window. Tab switching has been detected and recorded."
                audio_b64 = await generate_warning_audio(warning_text, language)
                await websocket.send_json({
                    "type": "message",
                    "content": warning_text,
                    "audio_base64": audio_b64,
                    "is_warning": True
                })
                continue
                
            # Prepare input for the graph
            graph_input = {}
            if msg_type == "end_interview":
                graph_input["question_count"] = current_state.get("max_questions", 5) + 1
            elif msg_type == "message":
                graph_input["messages"] = [{"type": "human", "content": content}]

            # Invoke Aegra graph asynchronously and stream output
            new_state, final_text = await process_agent_stream(session_id, graph_input, send_delta)
            
            # Check if interview is over based on max questions
            is_over = new_state.get("question_count", 0) > new_state.get("max_questions", 5)
            
            if is_over and not new_state.get("evaluation_payload"):
                messages = new_state.get("messages", [])
                job_title = new_state.get("job_title", "")
                
                await websocket.send_json({
                    "type": "evaluation_complete",
                    "content": "The interview has concluded. Generating scorecard asynchronously..."
                })
                
                # Decoupled Evaluation via Celery worker
                evaluate_candidate.delay(session_id, job_title, [m.dict() if hasattr(m, 'dict') else m for m in messages])
                break # Close loop when done
            else:
                telemetry = new_state.get("telemetry", {})
                if telemetry:
                    session_totals["prompt"] += telemetry.get("prompt_tokens", 0)
                    session_totals["completion"] += telemetry.get("completion_tokens", 0)
                    session_totals["latency_sum"] += telemetry.get("latency_ms", 0)
                    session_totals["turns"] += 1
                    
                    await websocket.send_json({
                        "type": "telemetry",
                        "prompt_tokens": telemetry.get("prompt_tokens", 0),
                        "completion_tokens": telemetry.get("completion_tokens", 0),
                        "latency_ms": telemetry.get("latency_ms", 0)
                    })
                    
                # Generate audio
                audio_base64 = ""
                if final_text:
                    audio_base64 = await generate_full_audio_from_text(final_text, language=new_state.get("language", "en"))

                final_messages = new_state.get("messages", [])
                if final_messages:
                    last_msg = final_messages[-1]
                    if getattr(last_msg, "type", "") == "ai":
                        await websocket.send_json({
                            "type": "message",
                            "content": last_msg.content,
                            "question_count": new_state.get("question_count", 0),
                            "is_warning": False,
                            "audio_base64": audio_base64
                        })
                    
                messages = new_state.get("messages", [])
                if messages and new_state.get("question_count", 0) > 1:
                    asyncio.create_task(send_live_eval(websocket, messages, new_state.get("job_title", "")))
                            
    except WebSocketDisconnect:
        print(f"Client disconnected for session {session_id}")
        
        # Save TokenUsage to Postgres
        if session_totals["turns"] > 0:
            avg_latency = session_totals["latency_sum"] / session_totals["turns"]
            token_usage = TokenUsage(
                session_id=session_id,
                prompt_tokens=session_totals["prompt"],
                completion_tokens=session_totals["completion"],
                latency_ms=avg_latency
            )
            db.add(token_usage)
            await db.commit()
            
        # Trigger evaluation on unexpected disconnect if we have messages
        if 'current_values' in locals() and current_values.get("messages"):
            evaluate_candidate.delay(
                session_id, 
                current_values.get("job_title", ""), 
                [m.dict() if hasattr(m, 'dict') else m for m in current_values.get("messages", [])]
            )
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"Error in websocket for session {session_id}: {e}")
        try:
            await websocket.send_json({"type": "error", "message": str(e)})
            await websocket.close()
        except:
            pass
