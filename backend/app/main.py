import os
import io
import json
import uuid
import asyncio
import base64
from typing import Dict, Any, Optional
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, File, UploadFile, Form, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import PyPDF2
from docx import Document
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import Depends

from app.db.database import get_db
from app.db.models import Session

from langchain_core.messages import HumanMessage, AIMessage
from langchain_community.tools import DuckDuckGoSearchRun
from langchain_groq import ChatGroq
from langchain_google_genai import ChatGoogleGenerativeAI
from langgraph_sdk import get_client

# Aegra config
client = None
assistant_id = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    global client, assistant_id
    aegra_url = os.getenv("AEGRA_URL", "http://aegra:2026")
    try:
        client = get_client(url=aegra_url)
        assistant = await client.assistants.create(graph_id="agent")
        assistant_id = assistant["assistant_id"]
        print(f"Connected to Aegra at {aegra_url}. Assistant ID: {assistant_id}")
    except Exception as e:
        print(f"Failed to connect to Aegra at {aegra_url}: {e}")
    yield

app = FastAPI(title="AI Engineering Interviewer", lifespan=lifespan)

# Allow CORS for Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In production, restrict to frontend domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class StartSessionRequest(BaseModel):
    job_title: str
    persona: Optional[str] = "balanced"
    interview_type: Optional[str] = "technical"
    language: Optional[str] = "en"
    max_questions: Optional[int] = 5

async def fetch_domain_context(session_id: str, job_title: str, interview_type: str = "technical"):
    try:
        search_tool = DuckDuckGoSearchRun()
        
        is_junior = "junior" in job_title.lower() or "intern" in job_title.lower() or "entry" in job_title.lower()
        level_str = "entry level and basic" if is_junior else "advanced scenario based"
        
        queries = [
            f"latest real-world {job_title} interview questions asked at top tech companies 2024",
            f"advanced system design and architecture scenarios for {job_title} interviews",
            f"deep technical problem-solving and debugging questions for {job_title}"
        ]
        
        results = await asyncio.gather(
            asyncio.to_thread(search_tool.invoke, queries[0]),
            asyncio.to_thread(search_tool.invoke, queries[1]),
            asyncio.to_thread(search_tool.invoke, queries[2]),
            return_exceptions=True
        )
        
        combined_context = ""
        for i, res in enumerate(results):
            if not isinstance(res, Exception):
                combined_context += f"Source {i+1}:\n{res}\n\n"
                
        context_value = combined_context if combined_context else "Standard technical concepts for the role."
        if client:
            await client.threads.update_state(
                thread_id=session_id,
                values={"domain_context": context_value}
            )
    except Exception as e:
        print(f"Background search failed: {e}")
        if client:
            await client.threads.update_state(
                thread_id=session_id,
                values={"domain_context": "Standard technical concepts for the role."}
            )

live_evaluator = ChatGroq(model="llama-3.3-70b-versatile", temperature=0)
fallback_live_evaluator = ChatGoogleGenerativeAI(model="gemini-2.5-flash", temperature=0)

async def generate_live_scores(messages, job_title):
    try:
        history_msgs = []
        for m in messages[-3:]:
            m_type = m.get("type") if isinstance(m, dict) else m.type
            m_content = m.get("content") if isinstance(m, dict) else m.content
            if m_type in ("human", "ai"):
                history_msgs.append(f"{m_type}: {m_content}")
                
        history = "\n".join(history_msgs)
        if not history: return None
        
        prompt = f"Evaluate the latest response for a {job_title} role. Output strictly JSON with keys: technical, communication, problem_solving (values 0-100). Transcript:\n{history}"
        
        try:
            res = await asyncio.to_thread(live_evaluator.invoke, [HumanMessage(content=prompt)])
        except Exception as e:
            print(f"Groq Live eval error: {e}. Falling back to Gemini...")
            res = await asyncio.to_thread(fallback_live_evaluator.invoke, [HumanMessage(content=prompt)])
            
        content = res.content
        if "{" in content:
            content = content[content.find("{"):content.rfind("}")+1]
        return json.loads(content)
    except Exception as e:
        print(f"Live eval error: {e}")
        return None

def extract_text_from_file(filename: str, content: bytes) -> str:
    text = ""
    try:
        if filename.endswith(".pdf"):
            reader = PyPDF2.PdfReader(io.BytesIO(content))
            for page in reader.pages:
                text += page.extract_text() + "\n"
        elif filename.endswith(".docx"):
            doc = Document(io.BytesIO(content))
            for para in doc.paragraphs:
                text += para.text + "\n"
    except Exception as e:
        print(f"Failed to parse CV: {e}")
    return text

@app.post("/api/start-session")
async def start_session(req: StartSessionRequest, background_tasks: BackgroundTasks, db: AsyncSession = Depends(get_db)):
    if not client:
        return {"error": "Aegra client not initialized"}
        
    thread = await client.threads.create()
    session_id = thread["thread_id"]
    
    # Store session in our relational DB
    db_session = Session(id=session_id, job_role=req.job_title, status="in_progress")
    db.add(db_session)
    await db.commit()
    
    await client.threads.update_state(
        thread_id=session_id,
        values={
            "job_title": req.job_title,
            "persona": req.persona,
            "interview_type": req.interview_type,
            "language": req.language,
            "question_count": 0,
            "max_questions": req.max_questions,
            "evaluation_payload": None,
            "cheat_signals": 0,
            "latest_cheat_detected": False,
            "domain_context": "",
            "messages": []
        }
    )
    
    background_tasks.add_task(fetch_domain_context, session_id, req.job_title, req.interview_type)
    return {"session_id": session_id}

@app.post("/api/start-session-cv")
async def start_session_cv(
    background_tasks: BackgroundTasks,
    job_title: str = Form(...),
    persona: str = Form("balanced"),
    interview_type: str = Form("technical"),
    language: str = Form("en"),
    max_questions: int = Form(5),
    cv_file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db)
):
    if not client:
        return {"error": "Aegra client not initialized"}
        
    thread = await client.threads.create()
    session_id = thread["thread_id"]
    content = await cv_file.read()
    cv_text = extract_text_from_file(cv_file.filename, content)
    
    # Store session in our relational DB
    db_session = Session(id=session_id, job_role=job_title, status="in_progress")
    db.add(db_session)
    await db.commit()
    
    await client.threads.update_state(
        thread_id=session_id,
        values={
            "job_title": job_title,
            "persona": persona,
            "interview_type": interview_type,
            "language": language,
            "question_count": 0,
            "max_questions": max_questions,
            "evaluation_payload": None,
            "cheat_signals": 0,
            "latest_cheat_detected": False,
            "domain_context": "",
            "cv_text": cv_text[:5000],
            "messages": []
        }
    )
    
    background_tasks.add_task(fetch_domain_context, session_id, job_title, interview_type)
    return {"session_id": session_id}

@app.get("/api/scorecard/{session_id}")
async def get_scorecard(session_id: str):
    if not client: return {"error": "Aegra client not initialized"}
    
    try:
        state_resp = await client.threads.get_state(session_id)
        state = state_resp["values"]
        if not state.get("evaluation_payload"):
            return {"error": "Evaluation not completed yet", "status": "pending"}
        return state["evaluation_payload"]
    except Exception:
        return {"error": "Session not found"}

async def send_live_eval(websocket, messages, job_title):
    scores = await generate_live_scores(messages, job_title)
    if scores:
        try:
            await websocket.send_json({"type": "live_scores", "scores": scores})
        except:
            pass

async def generate_tts_base64(text: str, language: str) -> str:
    try:
        import edge_tts
        voice = "ar-EG-ShakirNeural" if language == "ar" else "en-US-AndrewMultilingualNeural"
        communicate = edge_tts.Communicate(text, voice, rate="+15%")
        audio_data = b""
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                audio_data += chunk["data"]
        return base64.b64encode(audio_data).decode('utf-8')
    except Exception as e:
        print(f"TTS Error: {e}")
        return ""

@app.websocket("/ws/{session_id}")
async def websocket_endpoint(websocket: WebSocket, session_id: str):
    await websocket.accept()
    if not client:
        await websocket.send_json({"type": "error", "message": "Aegra client not initialized"})
        await websocket.close()
        return
        
    try:
        try:
            state_resp = await client.threads.get_state(session_id)
        except Exception:
            await websocket.send_json({"type": "error", "message": "Invalid session_id"})
            await websocket.close()
            return
            
        current_values = state_resp["values"]
        
        # We manually trigger the interviewer node for the first question
        if not current_values.get("messages"):
            async for chunk in client.runs.stream(
                thread_id=session_id,
                assistant_id=assistant_id,
                input=None,
                stream_mode="values"
            ):
                pass
                
            state_resp = await client.threads.get_state(session_id)
            result_state = state_resp["values"]
            
            messages = result_state.get("messages", [])
            if messages:
                last_msg = messages[-1]
                last_ai_message = last_msg.get("content", "") if isinstance(last_msg, dict) else last_msg.content
                
                await websocket.send_json({
                    "type": "message",
                    "content": last_ai_message,
                    "question_count": result_state.get("question_count", 0),
                    "telemetry": result_state.get("telemetry", {})
                })
                
                language = result_state.get("language", "en")
                audio_b64 = await generate_tts_base64(last_ai_message, language)
                await websocket.send_json({
                    "type": "audio_only",
                    "audio_base64": audio_b64
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

            state_resp = await client.threads.get_state(session_id)
            current_state = state_resp["values"]
            
            if msg_type == "change_language":
                await client.threads.update_state(session_id, values={"language": content})
                continue
            elif msg_type == "tab_switch":
                new_cheat = current_state.get("cheat_signals", 0) + 1
                await client.threads.update_state(session_id, values={"cheat_signals": new_cheat})
                
                language = current_state.get("language", "en")
                warning_text = "يرجى الانتباه، لقد تم رصد تبديل للنافذة. نرجو الحفاظ على التركيز في المقابلة." if language == "ar" else "Please remain focused on the interview window. Tab switching has been detected and recorded."
                audio_b64 = await generate_tts_base64(warning_text, language)
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

            # Invoke Aegra graph asynchronously
            async for chunk in client.runs.stream(
                thread_id=session_id,
                assistant_id=assistant_id,
                input=graph_input,
                stream_mode="values"
            ):
                pass
                
            state_resp = await client.threads.get_state(session_id)
            new_state = state_resp["values"]
            
            if new_state.get("evaluation_payload"):
                await websocket.send_json({
                    "type": "evaluation_complete",
                    "content": "The interview has concluded. Generating scorecard...",
                    "payload": new_state["evaluation_payload"]
                })
            else:
                messages = new_state.get("messages", [])
                if messages:
                    last_msg = messages[-1]
                    last_msg_role = last_msg.get("type") if isinstance(last_msg, dict) else last_msg.type
                    last_msg_content = last_msg.get("content") if isinstance(last_msg, dict) else last_msg.content
                    
                    if last_msg_role == "ai":
                        await websocket.send_json({
                            "type": "message",
                            "content": last_msg_content,
                            "question_count": new_state.get("question_count", 0),
                            "telemetry": new_state.get("telemetry", {})
                        })
                        
                        language = new_state.get("language", "en")
                        audio_b64 = await generate_tts_base64(last_msg_content, language)
                        await websocket.send_json({
                            "type": "audio_only",
                            "audio_base64": audio_b64
                        })
                        
                        if new_state.get("question_count", 0) > 1:
                            asyncio.create_task(send_live_eval(websocket, messages, new_state.get("job_title", "")))
                            
    except WebSocketDisconnect:
        print(f"Client disconnected for session {session_id}")
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"Error in websocket for session {session_id}: {e}")
        try:
            await websocket.send_json({"type": "error", "message": str(e)})
            await websocket.close()
        except:
            pass
