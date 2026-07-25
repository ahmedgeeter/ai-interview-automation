import io
import PyPDF2
from docx import Document
from fastapi import APIRouter, Depends, BackgroundTasks, File, UploadFile, Form
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.database import get_db
from app.models.models import Session as DbSession
from app.models import state
from app.models.schema import StartSessionRequest
from app.services.research_service import fetch_domain_context

router = APIRouter()

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

@router.post("/start-session")
async def start_session(req: StartSessionRequest, background_tasks: BackgroundTasks, db: AsyncSession = Depends(get_db)):
    if not state.client:
        return {"error": "Aegra client not initialized"}
        
    thread = await state.client.threads.create(graph_id="agent")
    session_id = thread["thread_id"]
    
    db_session = DbSession(id=session_id, job_role=req.job_title, status="in_progress")
    db.add(db_session)
    await db.commit()
    
    state.pending_sessions[session_id] = {
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
    
    background_tasks.add_task(fetch_domain_context, session_id, req.job_title, req.interview_type)
    return {"session_id": session_id}

@router.post("/start-session-cv")
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
    if not state.client:
        return {"error": "Aegra client not initialized"}
        
    thread = await state.client.threads.create(graph_id="agent")
    session_id = thread["thread_id"]
    content = await cv_file.read()
    cv_text = extract_text_from_file(cv_file.filename, content)
    
    db_session = DbSession(id=session_id, job_role=job_title, status="in_progress")
    db.add(db_session)
    await db.commit()
    
    state.pending_sessions[session_id] = {
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
    
    background_tasks.add_task(fetch_domain_context, session_id, job_title, interview_type)
    return {"session_id": session_id}

@router.get("/scorecard/{session_id}")
async def get_scorecard(session_id: str):
    if not state.client: return {"error": "Aegra client not initialized"}
    
    try:
        state_resp = await state.client.threads.get_state(session_id)
        current_state = state_resp["values"]
        if not current_state.get("evaluation_payload"):
            return {"error": "Evaluation not completed yet", "status": "pending"}
        return current_state["evaluation_payload"]
    except Exception:
        return {"error": "Session not found"}
