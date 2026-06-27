from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uuid
import json
from typing import Dict, Any, Optional

from app.graph.workflow import graph_app
from langchain_core.messages import HumanMessage, AIMessage

app = FastAPI(title="AI Engineering Interviewer")

# Allow CORS for Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In production, restrict to frontend domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-Memory Session Management
# Maps session_id to state
sessions: Dict[str, Dict[str, Any]] = {}

class StartSessionRequest(BaseModel):
    job_title: str
    persona: Optional[str] = "balanced"
    interview_type: Optional[str] = "technical"
    language: Optional[str] = "en"
    max_questions: Optional[int] = 5

import io
from fastapi import File, UploadFile, Form, BackgroundTasks
import PyPDF2
from docx import Document
import asyncio
from langchain_community.tools import DuckDuckGoSearchRun

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
                
        if session_id in sessions:
            sessions[session_id]["domain_context"] = combined_context if combined_context else "Standard technical concepts for the role."
    except Exception as e:
        print(f"Background search failed: {e}")
        if session_id in sessions:
            sessions[session_id]["domain_context"] = "Standard technical concepts for the role."

from langchain_groq import ChatGroq
from langchain_google_genai import ChatGoogleGenerativeAI

live_evaluator = ChatGroq(model="llama-3.3-70b-versatile", temperature=0)
fallback_live_evaluator = ChatGoogleGenerativeAI(model="gemini-2.5-flash", temperature=0)

async def generate_live_scores(messages, job_title):
    try:
        # Extract last few messages for context
        history = "\n".join([f"{m.type}: {m.content}" for m in messages[-3:] if m.type in ("human", "ai")])
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
        import json
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
async def start_session(req: StartSessionRequest, background_tasks: BackgroundTasks):
    session_id = str(uuid.uuid4())
    
    sessions[session_id] = {
        "messages": [],
        "job_title": req.job_title,
        "persona": req.persona,
        "interview_type": req.interview_type,
        "language": req.language,
        "question_count": 0,
        "max_questions": req.max_questions,
        "evaluation_payload": None,
        "cheat_signals": 0,
        "latest_cheat_detected": False,
        "domain_context": ""
    }
    
    # Run real-time search as a background task to instantly return session
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
    cv_file: UploadFile = File(...)
):
    session_id = str(uuid.uuid4())
    
    content = await cv_file.read()
    cv_text = extract_text_from_file(cv_file.filename, content)
    
    sessions[session_id] = {
        "messages": [],
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
        "cv_text": cv_text[:5000]
    }
    
    # Run real-time search as a background task to instantly return session
    background_tasks.add_task(fetch_domain_context, session_id, job_title, interview_type)
    
    return {"session_id": session_id}

@app.get("/api/scorecard/{session_id}")
async def get_scorecard(session_id: str):
    if session_id not in sessions:
        return {"error": "Session not found"}
        
    state = sessions[session_id]
    if not state.get("evaluation_payload"):
        return {"error": "Evaluation not completed yet", "status": "pending"}
        
    return state["evaluation_payload"]

async def send_live_eval(websocket, messages, job_title):
    scores = await generate_live_scores(messages, job_title)
    if scores:
        try:
            await websocket.send_json({"type": "live_scores", "scores": scores})
        except:
            pass

import base64
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
    
    if session_id not in sessions:
        await websocket.send_json({"type": "error", "message": "Invalid session_id"})
        await websocket.close()
        return
        
    try:
        # Initial greeting from AI
        state = sessions[session_id]
        
        # We manually trigger the interviewer node for the first question
        if not state["messages"]:
            result_state = graph_app.invoke(state)
            # Update session state
            sessions[session_id] = result_state
            last_ai_message = result_state["messages"][-1].content
            
            await websocket.send_json({
                "type": "message",
                "content": last_ai_message,
                "question_count": result_state["question_count"],
                "telemetry": result_state.get("telemetry", {})
            })
            
            language = result_state.get("language", "en")
            audio_b64 = await generate_tts_base64(last_ai_message, language)
            await websocket.send_json({
                "type": "audio_only",
                "audio_base64": audio_b64
            })

        while True:
            # Wait for user input or frontend signals
            data = await websocket.receive_text()
            
            try:
                payload = json.loads(data)
                msg_type = payload.get("type", "message")
                content = payload.get("content", "")
            except:
                # Fallback if plain text
                msg_type = "message"
                content = data

            # Get current state
            current_state = sessions[session_id]
            
            # Handle user message
            if msg_type == "message":
                current_state["messages"].append(HumanMessage(content=content))
            elif msg_type == "change_language":
                current_state["language"] = content
                continue # don't invoke graph on just language change
            elif msg_type == "tab_switch":
                current_state["cheat_signals"] = current_state.get("cheat_signals", 0) + 1
                language = current_state.get("language", "en")
                warning_text = "يرجى الانتباه، لقد تم رصد تبديل للنافذة. نرجو الحفاظ على التركيز في المقابلة." if language == "ar" else "Please remain focused on the interview window. Tab switching has been detected and recorded."
                audio_b64 = await generate_tts_base64(warning_text, language)
                await websocket.send_json({
                    "type": "message",
                    "content": warning_text,
                    "audio_base64": audio_b64,
                    "is_warning": True
                })
                continue # Bypass LangGraph for this event
            elif msg_type == "end_interview":
                # Bypass the rest of the interview and force evaluation
                current_state["question_count"] = current_state.get("max_questions", 5) + 1
                
            # Invoke graph
            # Note: For long LLM calls, we might want to run this async or stream the output.
            # For simplicity, we are invoking synchronously. Streaming can be added by iterating over graph_app.stream
            new_state = graph_app.invoke(current_state)
            
            # Update session state
            sessions[session_id] = new_state
            
            # If evaluator node was reached
            if new_state.get("evaluation_payload"):
                await websocket.send_json({
                    "type": "evaluation_complete",
                    "content": "The interview has concluded. Generating scorecard...",
                    "payload": new_state["evaluation_payload"]
                })
                # We can close the connection if we want, or let the client close it
            else:
                # Send next AI message
                last_msg = new_state["messages"][-1]
                if isinstance(last_msg, AIMessage):
                    await websocket.send_json({
                        "type": "message",
                        "content": last_msg.content,
                        "question_count": new_state["question_count"],
                        "telemetry": new_state.get("telemetry", {})
                    })
                    
                    language = new_state.get("language", "en")
                    audio_b64 = await generate_tts_base64(last_msg.content, language)
                    await websocket.send_json({
                        "type": "audio_only",
                        "audio_base64": audio_b64
                    })
                    
                    # Fire off live eval async (fire and forget)
                    if new_state["question_count"] > 1:
                        asyncio.create_task(send_live_eval(websocket, new_state["messages"], new_state.get("job_title", "")))
                        
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
