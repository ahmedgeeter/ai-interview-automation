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

async def send_live_eval(websocket: WebSocket, messages: list, job_title: str, session_totals: dict):
    scores, eval_tokens = await generate_live_scores(messages, job_title)
    if scores:
        try:
            await websocket.send_json({"type": "live_scores", "scores": scores})
        except:
            pass
    if eval_tokens:
        session_totals["prompt"] += eval_tokens.get("prompt_tokens", 0)
        session_totals["completion"] += eval_tokens.get("completion_tokens", 0)
        state.global_stats["total_prompt_tokens"] += eval_tokens.get("prompt_tokens", 0)
        state.global_stats["total_completion_tokens"] += eval_tokens.get("completion_tokens", 0)
        try:
            await websocket.send_json({
                "type": "telemetry",
                "prompt_tokens": eval_tokens.get("prompt_tokens", 0),
                "completion_tokens": eval_tokens.get("completion_tokens", 0),
                "latency_ms": 0,
                "voice_tokens": 0
            })
        except:
            pass

@router.websocket("/dashboard")
async def dashboard_endpoint(websocket: WebSocket):
    await websocket.accept()
    state.dashboard_connections.append(websocket)
    try:
        # Send initial state
        await websocket.send_json({
            "type": "dashboard_init",
            "stats": state.global_stats
        })
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        state.dashboard_connections.remove(websocket)
    except Exception:
        if websocket in state.dashboard_connections:
            state.dashboard_connections.remove(websocket)

async def broadcast_dashboard_update():
    for d_ws in state.dashboard_connections:
        try:
            await d_ws.send_json({
                "type": "dashboard_update",
                "stats": state.global_stats
            })
        except:
            pass

@router.websocket("/{session_id}")
async def websocket_endpoint(websocket: WebSocket, session_id: str, db: AsyncSession = Depends(get_db)):
    await websocket.accept()
    state.global_stats["active_sessions"] += 1
    asyncio.create_task(broadcast_dashboard_update())
    if not state.client:
        await websocket.send_json({"type": "error", "message": "Aegra client not initialized"})
        await websocket.close()
        return
        
    session_totals = {"prompt": 0, "completion": 0, "latency_sum": 0, "turns": 0, "voice": 0}
        
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
            # Remove empty/null values and fields not in InterviewState that cause 422
            allowed_keys = [
                "messages", "job_title", "persona", "domain_context", "cv_text",
                "interview_type", "language", "telemetry", "interview_context",
                "is_research_done", "question_count", "max_questions",
                "evaluation_payload", "cheat_signals", "latest_cheat_detected"
            ]
            clean_config = {k: v for k, v in initial_config.items() if k in allowed_keys and v is not None and v != [] and v != ""}
            lang = initial_config.get("language", "en")
            clean_config["messages"] = [{"type": "human", "content": f"Start the interview. Ask the first question now. [LANGUAGE:{lang}]"}]
            new_state, final_text = await process_agent_stream(session_id, clean_config, send_delta)
            
            # Send telemetry
            telemetry = new_state.get("telemetry", {})
            if telemetry:
                session_totals["prompt"] += telemetry.get("prompt_tokens", 0)
                session_totals["completion"] += telemetry.get("completion_tokens", 0)
                session_totals["latency_sum"] += telemetry.get("latency_ms", 0)
                session_totals["turns"] += 1
                
                # Update global stats
                state.global_stats["total_prompt_tokens"] += telemetry.get("prompt_tokens", 0)
                state.global_stats["total_completion_tokens"] += telemetry.get("completion_tokens", 0)
                
                # Assume standard Groq Llama-3-70b cost: $0.59 / 1M prompt, $0.79 / 1M completion
                prompt_cost = (telemetry.get("prompt_tokens", 0) / 1_000_000) * 0.59
                completion_cost = (telemetry.get("completion_tokens", 0) / 1_000_000) * 0.79
                state.global_stats["total_cost"] += (prompt_cost + completion_cost)
                
                asyncio.create_task(broadcast_dashboard_update())
                
                await websocket.send_json({
                    "type": "telemetry",
                    "prompt_tokens": telemetry.get("prompt_tokens", 0),
                    "completion_tokens": telemetry.get("completion_tokens", 0),
                    "latency_ms": telemetry.get("latency_ms", 0),
                    "voice_tokens": 0
                })

            # Generate audio for first question
            audio_base64 = ""
            if final_text:
                audio_base64, voice_tokens = await generate_full_audio_from_text(final_text, language=new_state.get("language", "en"))
                session_totals["voice"] += voice_tokens
                await websocket.send_json({
                    "type": "telemetry",
                    "prompt_tokens": 0,
                    "completion_tokens": 0,
                    "latency_ms": 0,
                    "voice_tokens": voice_tokens
                })

            final_messages = new_state.get("messages", [])
            if final_messages:
                last_msg = final_messages[-1]
                last_msg_type = last_msg.get("type", "") if isinstance(last_msg, dict) else getattr(last_msg, "type", "")
                last_msg_content = last_msg.get("content", "") if isinstance(last_msg, dict) else getattr(last_msg, "content", "")
                if last_msg_type == "ai":
                    await websocket.send_json({
                        "type": "message",
                        "content": last_msg_content,
                        "question_count": new_state.get("question_count", 0),
                        "is_warning": False,
                        "audio_base64": audio_base64
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
            
            # Removed continue so it falls through to graph execution
            if msg_type == "tab_switch":
                new_cheat = current_state.get("cheat_signals", 0) + 1
                await state.client.threads.update_state(session_id, values={"cheat_signals": new_cheat})
                
                language = current_state.get("language", "en")
                warning_text = "يرجى الانتباه، لقد تم رصد تبديل للنافذة. نرجو الحفاظ على التركيز في المقابلة." if language == "ar" else "Please remain focused on the interview window. Tab switching has been detected and recorded."
                audio_b64, voice_tokens = await generate_warning_audio(warning_text, language)
                session_totals["voice"] += voice_tokens
                
                await websocket.send_json({
                    "type": "telemetry",
                    "prompt_tokens": 0,
                    "completion_tokens": 0,
                    "latency_ms": 0,
                    "voice_tokens": voice_tokens
                })
                
                await websocket.send_json({
                    "type": "message",
                    "content": warning_text,
                    "audio_base64": audio_b64,
                    "is_warning": True
                })
                continue
                
            # Prepare input for the graph
            graph_input = {}
            if msg_type == "change_language":
                await state.client.threads.update_state(session_id, values={"language": content})
                lang_name = "English" if content == "en" else "Egyptian Arabic (Ammiya)" if content == "ar-eg" else "Formal Standard Arabic (Fusha)"
                graph_input["messages"] = [{"type": "human", "content": f"[SYSTEM EVENT: The user has dynamically switched the interface language to {lang_name}. Please briefly acknowledge this change in {lang_name}, and then restate your PREVIOUS question exactly, but translated into {lang_name}. Do NOT evaluate an answer, just translate and re-ask the last question.]"}]
            elif msg_type == "end_interview":
                graph_input["question_count"] = current_state.get("max_questions", 5) + 1
            elif msg_type == "message":
                graph_input["messages"] = [{"type": "human", "content": content}]

            # Invoke Aegra graph asynchronously and stream output
            new_state, final_text = await process_agent_stream(session_id, graph_input, send_delta)
            
            # Check if interview is over based on max questions
            is_over = new_state.get("question_count", 0) > new_state.get("max_questions", 5)
            
            if is_over:
                await websocket.send_json({
                    "type": "evaluation_complete",
                    "content": "The interview has concluded. Generating scorecard asynchronously..."
                })
                
                if not new_state.get("evaluation_payload"):
                    messages = new_state.get("messages", [])
                    job_title = new_state.get("job_title", "")
                    evaluate_candidate.delay(session_id, job_title, [m.dict() if hasattr(m, 'dict') else m for m in messages])
                    
                break # Close loop when done
            else:
                telemetry = new_state.get("telemetry", {})
                if telemetry:
                    session_totals["prompt"] += telemetry.get("prompt_tokens", 0)
                    session_totals["completion"] += telemetry.get("completion_tokens", 0)
                    session_totals["latency_sum"] += telemetry.get("latency_ms", 0)
                    session_totals["turns"] += 1
                    
                    # Update global stats
                    state.global_stats["total_prompt_tokens"] += telemetry.get("prompt_tokens", 0)
                    state.global_stats["total_completion_tokens"] += telemetry.get("completion_tokens", 0)
                    
                    prompt_cost = (telemetry.get("prompt_tokens", 0) / 1_000_000) * 0.59
                    completion_cost = (telemetry.get("completion_tokens", 0) / 1_000_000) * 0.79
                    state.global_stats["total_cost"] += (prompt_cost + completion_cost)
                    
                    asyncio.create_task(broadcast_dashboard_update())
                    
                    await websocket.send_json({
                        "type": "telemetry",
                        "prompt_tokens": telemetry.get("prompt_tokens", 0),
                        "completion_tokens": telemetry.get("completion_tokens", 0),
                        "latency_ms": telemetry.get("latency_ms", 0),
                        "voice_tokens": 0
                    })
                    
                # Generate audio
                audio_base64 = ""
                if final_text:
                    audio_base64, voice_tokens = await generate_full_audio_from_text(final_text, language=new_state.get("language", "en"))
                    session_totals["voice"] += voice_tokens
                    await websocket.send_json({
                        "type": "telemetry",
                        "prompt_tokens": 0,
                        "completion_tokens": 0,
                        "latency_ms": 0,
                        "voice_tokens": voice_tokens
                    })

                final_messages = new_state.get("messages", [])
                if final_messages:
                    last_msg = final_messages[-1]
                    last_msg_type = last_msg.get("type", "") if isinstance(last_msg, dict) else getattr(last_msg, "type", "")
                    last_msg_content = last_msg.get("content", "") if isinstance(last_msg, dict) else getattr(last_msg, "content", "")
                    if last_msg_type == "ai":
                        await websocket.send_json({
                            "type": "message",
                            "content": last_msg_content,
                            "question_count": new_state.get("question_count", 0),
                            "is_warning": False,
                            "audio_base64": audio_base64
                        })
                    
                messages = new_state.get("messages", [])
                if msg_type == "message" and messages and new_state.get("question_count", 0) > 1:
                    asyncio.create_task(send_live_eval(websocket, messages, new_state.get("job_title", ""), session_totals))
                            
    except WebSocketDisconnect:
        print(f"Client disconnected for session {session_id}")
        state.global_stats["active_sessions"] = max(0, state.global_stats["active_sessions"] - 1)
        asyncio.create_task(broadcast_dashboard_update())
        
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
