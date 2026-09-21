"""
Session Controller (session_ctrl.py)
------------------------------------
This module provides RESTful endpoints to initialize and manage interview sessions.
It handles candidate inputs (such as uploading CVs), parses documents to extract context,
initializes the LangGraph state in memory, and offloads heavy research tasks (e.g., fetching domain context)
to background workers to ensure the API responds instantly.
"""
import io
from pypdf import PdfReader
from docx import Document
from fastapi import APIRouter, Depends, BackgroundTasks, File, UploadFile, Form, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.database import get_db
from app.models.models import Session as DbSession
from app.models import state
from app.models.schema import StartSessionRequest
from app.services.research_service import fetch_domain_context
from app.services.tts_service import generate_full_audio_from_text
from app.graph.workflow import graph_app
import uuid

router = APIRouter()

def validate_file_signature(filename: str, content: bytes) -> bool:
    """Validates real file magic bytes to prevent MIME spoofing."""
    if not content:
        return False
    lower_name = filename.lower()
    if lower_name.endswith(".pdf"):
        return content.startswith(b"%PDF-")
    elif lower_name.endswith(".docx"):
        return content.startswith(b"PK\x03\x04")
    elif lower_name.endswith(".txt"):
        try:
            content.decode("utf-8")
            return b"\x00" not in content[:1024]
        except UnicodeDecodeError:
            return False
    return False

def extract_text_from_file(filename: str, content: bytes) -> str:
    text = ""
    try:
        if filename.lower().endswith(".pdf"):
            reader = PdfReader(io.BytesIO(content))
            for page in reader.pages:
                page_text = page.extract_text()
                if page_text:
                    text += page_text + "\n"
        elif filename.lower().endswith(".docx"):
            doc = Document(io.BytesIO(content))
            for para in doc.paragraphs:
                text += para.text + "\n"
        elif filename.lower().endswith(".txt"):
            text = content.decode("utf-8", errors="replace")
    except Exception as e:
        print(f"Failed to parse CV: {e}")
    return text

from sqlalchemy import select
from app.models.models import Evaluation

@router.post("/start-session")
async def start_session(req: StartSessionRequest, background_tasks: BackgroundTasks, db: AsyncSession = Depends(get_db)):
    session_id = str(uuid.uuid4())

    # Determine effective max_questions from limit_mode
    if req.limit_mode == "time":
        effective_max_questions = 999  # unlimited questions, controlled by time
    else:
        effective_max_questions = req.limit_value or req.max_questions or 5

    # Synchronously execute real web research & scenario blueprint generation
    domain_context = await fetch_domain_context(session_id, req.job_title, req.interview_type)

    session_config = {
        "job_title": req.job_title,
        "persona": req.persona,
        "interview_type": req.interview_type,
        "language": req.language,
        "question_count": 0,
        "max_questions": effective_max_questions,
        "limit_mode": req.limit_mode or "questions",
        "limit_value": req.limit_value or req.max_questions or 5,
        "evaluation_payload": None,
        "cheat_signals": 0,
        "latest_cheat_detected": False,
        "domain_context": domain_context,
        "messages": []
    }

    state.pending_sessions[session_id] = session_config

    try:
        db_session = DbSession(id=session_id, job_role=req.job_title, config=session_config, status="in_progress")
        db.add(db_session)
        await db.commit()
    except Exception as db_err:
        print(f"[SessionCtrl] DB persistence warning: {db_err}. Session active in memory.")

    return {"session_id": session_id}

@router.post("/start-session-cv")
async def start_session_cv(
    job_title: str = Form(...),
    persona: str = Form("balanced"),
    interview_type: str = Form("technical"),
    language: str = Form("en"),
    max_questions: int = Form(5),
    limit_mode: str = Form("questions"),
    limit_value: int = Form(5),
    cv_file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db)
):
    # Security validation: Job title length
    safe_job_title = (job_title or "").strip()[:120]
    if len(safe_job_title) < 2:
        raise HTTPException(status_code=400, detail="Invalid job title.")

    # Security validation: File extension
    filename = (cv_file.filename or "").lower()
    allowed_exts = (".pdf", ".docx", ".txt")
    if not any(filename.endswith(ext) for ext in allowed_exts):
        raise HTTPException(status_code=400, detail="Unsupported file format. Please upload PDF, DOCX, or TXT.")

    # Security validation: File size limit (5MB max)
    content = await cv_file.read()
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File too large. Maximum CV size is 5MB.")

    # Security validation: Magic bytes inspection (anti-MIME spoofing)
    if not validate_file_signature(cv_file.filename or "", content):
        raise HTTPException(status_code=400, detail="Invalid file signature. File content does not match its extension.")

    session_id = str(uuid.uuid4())
    cv_text = extract_text_from_file(cv_file.filename, content)

    effective_max_questions = 999 if limit_mode == "time" else (limit_value or max_questions)

    # Cross-reference CV stack with live web research (cap CV excerpt to 4000 chars)
    domain_context = await fetch_domain_context(session_id, safe_job_title, interview_type, cv_text=cv_text[:4000])

    session_config = {
        "job_title": job_title,
        "persona": persona,
        "interview_type": interview_type,
        "language": language,
        "question_count": 0,
        "max_questions": effective_max_questions,
        "limit_mode": limit_mode,
        "limit_value": limit_value,
        "evaluation_payload": None,
        "cheat_signals": 0,
        "latest_cheat_detected": False,
        "domain_context": domain_context,
        "cv_text": cv_text[:5000],
        "messages": []
    }

    state.pending_sessions[session_id] = session_config

    try:
        db_session = DbSession(id=session_id, job_role=job_title, config=session_config, status="in_progress")
        db.add(db_session)
        await db.commit()
    except Exception as db_err:
        print(f"[SessionCtrl] DB persistence warning: {db_err}. Session active in memory.")

    return {"session_id": session_id}

@router.get("/scorecard/{session_id}")
@router.get("/evaluation/{session_id}")
async def get_scorecard(session_id: str, db: AsyncSession = Depends(get_db)):
    """Fetch scorecard from DB with fallback to LangGraph state and on-demand generation."""
    try:
        # 1. Check Evaluation table in DB
        result = await db.execute(select(Evaluation).filter(Evaluation.session_id == session_id))
        eval_record = result.scalars().first()
        if eval_record and eval_record.scorecard:
            return eval_record.scorecard

        # 2. Check LangGraph checkpoint state
        current_state = {}
        try:
            config = {"configurable": {"thread_id": session_id}}
            state_resp = await graph_app.aget_state(config)
            current_state = state_resp.values if hasattr(state_resp, 'values') else (state_resp or {})
            if current_state.get("evaluation_payload"):
                payload = current_state["evaluation_payload"]
                try:
                    eval_entry = Evaluation(session_id=session_id, scorecard=payload)
                    db.add(eval_entry)
                    await db.commit()
                except Exception:
                    pass
                return payload
        except Exception:
            pass

        # 3. If session had conversation messages, trigger on-demand evaluation now
        messages = current_state.get("messages", [])
        if messages:
            try:
                job_title = current_state.get("job_title", "Senior AI Engineer")
                from app.workers.assessor import evaluate_candidate
                scorecard = await evaluate_candidate(
                    session_id, 
                    job_title, 
                    [m.dict() if hasattr(m, 'dict') else m for m in messages]
                )
                if scorecard and isinstance(scorecard, dict) and not scorecard.get("error"):
                    return scorecard
            except Exception as on_demand_err:
                print(f"[Scorecard API] On-demand evaluation error: {on_demand_err}")

        # 4. Check Session status in DB
        s_result = await db.execute(select(DbSession).filter(DbSession.id == session_id))
        db_s = s_result.scalars().first()
        if db_s and db_s.status in ("in_progress", "evaluating"):
            return {"status": "pending", "message": "Evaluation generating in background"}

        return {"error": "Evaluation not completed yet", "status": "pending"}
    except Exception as e:
        print(f"Error fetching scorecard for {session_id}: {e}")
        return {"error": "Session not found", "status": "not_found"}

@router.get("/session/{session_id}")
@router.get("/session/{session_id}/config")
async def get_session_config(session_id: str, db: AsyncSession = Depends(get_db)):
    """Return session configuration for the interview page (persisted & resilient)."""
    session = state.pending_sessions.get(session_id)
    if not session:
        # Restore from DB if server restarted
        try:
            result = await db.execute(select(DbSession).filter(DbSession.id == session_id))
            db_session = result.scalars().first()
            if db_session and db_session.config:
                session = db_session.config
                state.pending_sessions[session_id] = session
            else:
                return {"error": "Session not found"}
        except Exception as e:
            print(f"[SessionConfig] DB query notice: {e}")
            return {"error": "Session not found"}
            
    return {
        "job_title": session.get("job_title", ""),
        "limit_mode": session.get("limit_mode", "questions"),
        "limit_value": session.get("limit_value", 5),
        "voice_lang": session.get("language", "en"),
        "persona": session.get("persona", "balanced"),
        "interview_type": session.get("interview_type", "technical"),
    }

@router.get("/test-voice")
async def test_voice(lang: str):
    """Generate a quick sample audio for the requested language."""
    if lang == "ar":
        text = "مرحباً بك، أنا حامد وسأكون محاورك في هذه المقابلة التقنية."
    elif lang == "ar-eg":
        text = "أهلاً بيك يا باشمهندس، أنا شاكر وهكون معاك في المقابلة التقنية النهاردة."
    else:
        text = "Hello, I am Charlie and I will be conducting your technical interview today."
        
    audio_b64, _ = await generate_full_audio_from_text(text, lang)
    return {"audio_base64": audio_b64}

@router.get("/health")
@router.head("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "ok", "service": "autohire-api"}
