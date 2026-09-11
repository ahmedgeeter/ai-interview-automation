import json
import asyncio
import redis.asyncio as aioredis
import os
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.database import get_db
from app.models.models import TokenUsage
from app.models import state
from app.services.agent_service import process_agent_stream, generate_warning_audio, generate_live_scores
from app.services.tts_service import generate_audio_chunks_from_text, generate_full_audio_from_text
from app.workers.assessor import evaluate_candidate
from app.graph.workflow import graph_app

router = APIRouter()

REDIS_URL = os.getenv("CELERY_BROKER_URL", "redis://redis:6379/0")

# Registry for active generation tasks per session
active_session_tasks = {}
session_last_msg_time = {}

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

async def keep_alive(websocket: WebSocket):
    """Sends a ping every 25 seconds to keep connection alive behind proxies."""
    try:
        while True:
            await asyncio.sleep(25)
            await websocket.send_json({"type": "ping"})
    except asyncio.CancelledError:
        pass
    except Exception:
        pass

async def redis_listener(websocket: WebSocket, session_id: str):
    """Listens for the final scorecard from Celery."""
    try:
        redis = aioredis.from_url(REDIS_URL)
        pubsub = redis.pubsub()
        channel_name = f"autohire_eval_{session_id}"
        await pubsub.subscribe(channel_name)
        async for message in pubsub.listen():
            if message["type"] == "message":
                data = json.loads(message["data"])
                await websocket.send_json({
                    "type": "evaluation_complete",
                    "scorecard": data
                })
                break
    except asyncio.CancelledError:
        pass
    except Exception:
        # In standalone or development mode without Redis container, Redis pubsub is omitted.
        pass
    finally:
        try:
            await pubsub.unsubscribe()
            await redis.close()
        except:
            pass

@router.websocket("/dashboard")
async def dashboard_endpoint(websocket: WebSocket):
    await websocket.accept()
    state.dashboard_connections.append(websocket)
    try:
        await websocket.send_json({"type": "dashboard_init", "stats": state.global_stats})
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
            await d_ws.send_json({"type": "dashboard_update", "stats": state.global_stats})
        except:
            pass

async def handle_agent_response(websocket: WebSocket, session_id: str, graph_input: dict, session_totals: dict):
    """Background task to process LLM and TTS stream."""
    try:
        async def send_delta(delta: str):
            try:
                await websocket.send_json({"type": "text_delta", "delta": delta})
            except Exception:
                pass

        new_state, final_text = await process_agent_stream(session_id, graph_input, send_delta)
        is_over = new_state.get("question_count", 0) > new_state.get("max_questions", 5)

        if is_over:
            try:
                await websocket.send_json({
                    "type": "message",
                    "content": "The interview has concluded. Generating scorecard asynchronously...",
                    "question_count": new_state.get("question_count", 0)
                })
            except Exception:
                pass

            scorecard = new_state.get("evaluation_payload")
            messages = new_state.get("messages", [])
            job_title = new_state.get("job_title", "Senior AI Engineer")

            if not scorecard:
                print(f"[WS] Generating evaluation for session {session_id}...")
                try:
                    scorecard = await evaluate_candidate(
                        session_id, 
                        job_title, 
                        [m.dict() if hasattr(m, 'dict') else m for m in messages]
                    )
                except Exception as eval_err:
                    print(f"[WS] Evaluation candidate error: {eval_err}")

            if scorecard and isinstance(scorecard, dict) and not scorecard.get("error"):
                # Save to database
                try:
                    from app.models.database import async_session_maker
                    from app.models.models import Evaluation, Session as DbSession
                    from sqlalchemy import select
                    if async_session_maker:
                        async with async_session_maker() as db_ctx:
                            db_s = (await db_ctx.execute(select(DbSession).filter(DbSession.id == session_id))).scalars().first()
                            if db_s:
                                db_s.status = "completed"
                            eval_record = Evaluation(session_id=session_id, scorecard=scorecard)
                            db_ctx.add(eval_record)
                            await db_ctx.commit()
                            print(f"[WS] Saved evaluation record to DB for session {session_id}")
                except Exception as save_err:
                    print(f"[WS] DB save error for evaluation: {save_err}")

                # Send evaluation_complete DIRECTLY over the WebSocket so frontend navigates
                try:
                    await websocket.send_json({
                        "type": "evaluation_complete",
                        "scorecard": scorecard
                    })
                    print(f"[WS] Sent evaluation_complete to WebSocket for session {session_id}")
                except Exception as ws_err:
                    print(f"[WS] Error sending evaluation_complete to websocket: {ws_err}")
            return

        telemetry = new_state.get("telemetry", {})
        if telemetry:
            session_totals["prompt"] += telemetry.get("prompt_tokens", 0)
            session_totals["completion"] += telemetry.get("completion_tokens", 0)
            session_totals["latency_sum"] += telemetry.get("latency_ms", 0)
            session_totals["turns"] += 1
            
            state.global_stats["total_prompt_tokens"] += telemetry.get("prompt_tokens", 0)
            state.global_stats["total_completion_tokens"] += telemetry.get("completion_tokens", 0)
            
            prompt_cost = (telemetry.get("prompt_tokens", 0) / 1_000_000) * 0.59
            completion_cost = (telemetry.get("completion_tokens", 0) / 1_000_000) * 0.79
            state.global_stats["total_cost"] += (prompt_cost + completion_cost)
            
            asyncio.create_task(broadcast_dashboard_update())
            
            try:
                await websocket.send_json({
                    "type": "telemetry",
                    "prompt_tokens": telemetry.get("prompt_tokens", 0),
                    "completion_tokens": telemetry.get("completion_tokens", 0),
                    "latency_ms": telemetry.get("latency_ms", 0),
                    "voice_tokens": 0
                })
            except Exception:
                pass

        final_messages = new_state.get("messages", [])
        if final_messages:
            last_msg = final_messages[-1]
            last_msg_content = last_msg.get("content", "") if isinstance(last_msg, dict) else getattr(last_msg, "content", "")
            
            # Send the text message first without audio to update UI instantly
            try:
                await websocket.send_json({
                    "type": "message",
                    "content": last_msg_content,
                    "question_count": new_state.get("question_count", 0),
                    "is_warning": False,
                })
            except Exception:
                pass
            
            # Stream audio chunks asynchronously
            if final_text:
                try:
                    async for chunk_b64 in generate_audio_chunks_from_text(final_text, language=new_state.get("language", "en")):
                        try:
                            await websocket.send_json({
                                "type": "audio_chunk",
                                "audio_base64": chunk_b64
                            })
                            # voice tokens estimation based on length, simplified
                            session_totals["voice"] += len(final_text)
                            await websocket.send_json({
                                "type": "telemetry",
                                "prompt_tokens": 0, "completion_tokens": 0, "latency_ms": 0,
                                "voice_tokens": len(final_text) // max(1, len(final_text.split())) # rough estimation per chunk
                            })
                        except Exception:
                            break
                except Exception as audio_err:
                    print(f"[TTS] Audio streaming error: {audio_err}")

        messages = new_state.get("messages", [])
        if messages and new_state.get("question_count", 0) > 1:
            asyncio.create_task(send_live_eval(websocket, messages, new_state.get("job_title", ""), session_totals))
            
    except asyncio.CancelledError:
        print(f"Task cancelled for session {session_id} due to interrupt.")
    except Exception as e:
        print(f"Error in handle_agent_response: {e}")

@router.websocket("/{session_id}")
async def websocket_endpoint(websocket: WebSocket, session_id: str, db: AsyncSession = Depends(get_db)):
    await websocket.accept()
    state.global_stats["active_sessions"] += 1
    asyncio.create_task(broadcast_dashboard_update())
        
    session_totals = {"prompt": 0, "completion": 0, "latency_sum": 0, "turns": 0, "voice": 0}
    current_values = {}
    
    keep_alive_task = asyncio.create_task(keep_alive(websocket))
    redis_task = asyncio.create_task(redis_listener(websocket, session_id))
        
    try:
        try:
            state_resp = await graph_app.aget_state({"configurable": {"thread_id": session_id}})
        except Exception:
            await websocket.send_json({"type": "error", "message": "Invalid session_id"})
            await websocket.close()
            return
            
        current_values = state_resp.values if hasattr(state_resp, 'values') else (state_resp or {})
            
        initial_config = state.pending_sessions.get(session_id)
        if not initial_config:
            from sqlalchemy import select
            from app.models.models import Session as DbSession
            result = await db.execute(select(DbSession).filter(DbSession.id == session_id))
            db_s = result.scalars().first()
            if db_s and db_s.config:
                initial_config = db_s.config
                state.pending_sessions[session_id] = initial_config
            else:
                initial_config = {}

        if not current_values.get("messages"):
            if not initial_config:
                print(f"[WS] No initial config or state found for session {session_id}. Initializing with robust defaults...")
                initial_config = {
                    "job_title": "Senior AI Engineer",
                    "persona": "balanced",
                    "interview_type": "technical",
                    "language": "ar-eg",
                    "question_count": 0,
                    "max_questions": 5,
                }
            allowed_keys = [
                "messages", "job_title", "persona", "domain_context", "cv_text",
                "interview_type", "language", "telemetry", "interview_context",
                "is_research_done", "question_count", "max_questions",
                "evaluation_payload", "cheat_signals", "latest_cheat_detected",
                "topic_coverage", "follow_up_depth"
            ]
            clean_config = {k: v for k, v in initial_config.items() if k in allowed_keys and v is not None and v != [] and v != ""}
            
            # Guarantee domain_context is present before Question 1 starts
            if not clean_config.get("domain_context"):
                cached_ctx = state.pending_sessions.get(session_id, {}).get("domain_context")
                if cached_ctx:
                    clean_config["domain_context"] = cached_ctx
                else:
                    from app.services.research_service import fetch_domain_context
                    j_title = clean_config.get("job_title", "Software Engineer")
                    i_type = clean_config.get("interview_type", "technical")
                    cv_t = clean_config.get("cv_text", "")
                    clean_config["domain_context"] = await fetch_domain_context(session_id, j_title, i_type, cv_t)

            lang = initial_config.get("language", "ar-eg")
            clean_config["messages"] = [{"type": "human", "content": f"Start the interview. Ask the first question now. [LANGUAGE:{lang}]"}]
            
            # Start initial generation task
            task = asyncio.create_task(handle_agent_response(websocket, session_id, clean_config, session_totals))
            active_session_tasks[session_id] = task
        else:
            # Candidate reconnected to existing session: replay last question so UI is instantly live
            final_messages = current_values.get("messages", [])
            last_ai = None
            for m in final_messages:
                m_type = m.get("type") if isinstance(m, dict) else getattr(m, "type", "")
                m_content = m.get("content") if isinstance(m, dict) else getattr(m, "content", "")
                if m_type == "ai":
                    last_ai = m_content
            if last_ai:
                try:
                    await websocket.send_json({
                        "type": "message",
                        "content": last_ai,
                        "question_count": current_values.get("question_count", 0),
                        "is_warning": False,
                    })
                except Exception:
                    pass

        while True:
            data = await websocket.receive_text()
            
            try:
                payload = json.loads(data)
                msg_type = payload.get("type", "message")
                content = payload.get("content", "")
            except:
                msg_type = "message"
                content = data

            if msg_type == "interrupt":
                # Handle barge-in: cancel current task and send interrupt event back for acknowledgment
                if session_id in active_session_tasks and not active_session_tasks[session_id].done():
                    active_session_tasks[session_id].cancel()
                try:
                    await websocket.send_json({"type": "interrupt", "message": "Task cancelled"})
                except Exception:
                    pass
                continue

            state_resp = await graph_app.aget_state({"configurable": {"thread_id": session_id}})
            current_state = state_resp.values if hasattr(state_resp, 'values') else (state_resp or {})
            
            if msg_type == "tab_switch":
                new_cheat = current_state.get("cheat_signals", 0) + 1
                await graph_app.aupdate_state({"configurable": {"thread_id": session_id}}, {"cheat_signals": new_cheat})
                
                language = current_state.get("language", "ar-eg")
                warning_text = "يرجى الانتباه، تم رصد تبديل للنافذة. نرجو الحفاظ على التركيز في المقابلة." if language.startswith("ar") else "Please remain focused on the interview window. Tab switching has been detected and recorded."
                audio_b64, voice_tokens = await generate_warning_audio(warning_text, language)
                session_totals["voice"] += voice_tokens
                
                try:
                    await websocket.send_json({
                        "type": "message",
                        "content": warning_text,
                        "is_warning": True
                    })
                    await websocket.send_json({
                        "type": "audio_chunk",
                        "audio_base64": audio_b64
                    })
                except Exception:
                    pass
                continue
                
            graph_input = {}
            if msg_type == "change_language":
                await graph_app.aupdate_state({"configurable": {"thread_id": session_id}}, {"language": content})
                lang_name = "English" if content == "en" else "Egyptian Arabic (Ammiya)" if content == "ar-eg" else "Formal Standard Arabic (Fusha)"
                graph_input["messages"] = [{"type": "human", "content": f"[SYSTEM EVENT: The user has dynamically switched the interface language to {lang_name}. Please briefly acknowledge this change in {lang_name}, and then restate your PREVIOUS question exactly, but translated into {lang_name}. Do NOT evaluate an answer, just translate and re-ask the last question.]"}]
            elif msg_type == "end_interview":
                graph_input["question_count"] = current_state.get("max_questions", 5) + 1
            elif msg_type == "message":
                import time
                now_ts = time.time()
                last_ts = session_last_msg_time.get(session_id, 0)
                if now_ts - last_ts < 0.6:
                    # Ignore rapid spam flood
                    continue
                session_last_msg_time[session_id] = now_ts

                # Hard truncate candidate message to 2,000 characters to prevent prompt stuffing / token abuse
                safe_content = (content or "").strip()
                if len(safe_content) > 2000:
                    safe_content = safe_content[:2000]
                graph_input["messages"] = [{"type": "human", "content": safe_content}]

            # Cancel any existing active task before starting a new one (to prevent race conditions)
            if session_id in active_session_tasks and not active_session_tasks[session_id].done():
                active_session_tasks[session_id].cancel()

            task = asyncio.create_task(handle_agent_response(websocket, session_id, graph_input, session_totals))
            active_session_tasks[session_id] = task
                            
    except WebSocketDisconnect:
        print(f"Client disconnected for session {session_id}")
        state.global_stats["active_sessions"] = max(0, state.global_stats["active_sessions"] - 1)
        asyncio.create_task(broadcast_dashboard_update())
        
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
            
        if current_values and current_values.get("messages"):
            # Ensure evaluation runs if disconnected unexpectedly but hasn't completed
            is_over = current_values.get("question_count", 0) > current_values.get("max_questions", 5)
            if not current_values.get("evaluation_payload"):
                asyncio.create_task(evaluate_candidate(
                    session_id, 
                    current_values.get("job_title", ""), 
                    [m.dict() if hasattr(m, 'dict') else m for m in current_values.get("messages", [])]
                ))
    except Exception as e:
        print(f"Error in websocket for session {session_id}: {e}")
        try:
            await websocket.send_json({"type": "error", "message": str(e)})
            await websocket.close()
        except:
            pass
    finally:
        if 'keep_alive_task' in locals() and keep_alive_task:
            keep_alive_task.cancel()
        if 'redis_task' in locals() and redis_task:
            redis_task.cancel()
        t = active_session_tasks.pop(session_id, None)
        if t and not t.done():
            t.cancel()
