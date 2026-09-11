import asyncio
import json
import os
import redis
from dotenv import load_dotenv

load_dotenv()

from langchain_groq import ChatGroq
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import HumanMessage
from sqlalchemy import select
from app.models.database import async_session_maker, sync_session_maker
from app.models.models import Evaluation, Session
from app.workers.celery_app import celery_app

GROQ_EVAL_MODEL = os.getenv("GROQ_MODEL", "qwen/qwen3.8-27b")
GEMINI_EVAL_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")


def _generate_scorecard_sync(job_title: str, history: str) -> dict:
    """Core evaluation prompt execution with model fallback."""
    prompt = f"""Evaluate the following technical interview transcript for a {job_title} role.
Output strictly a JSON object with keys: 
technical_depth (0-100), communication (0-100), problem_solving (0-100), architecture (0-100), integrity (0-100), 
key_strengths (list of strings), key_weaknesses (list of strings), red_flags (list of strings), 
final_recommendation ("Strong Hire" | "Hire" | "No Hire"), 
recommended_resources (list of objects with title, url, reason).

Transcript:
{history}"""

    use_groq = os.getenv("USE_GROQ_PRIMARY", "true").lower() in ("true", "1", "yes")
    if use_groq:
        try:
            evaluator = ChatGroq(
                model=GROQ_EVAL_MODEL,
                temperature=0,
                api_key=os.getenv("GROQ_API_KEY", "")
            )
            res = evaluator.invoke([HumanMessage(content=prompt)])
        except Exception as e:
            print(f"[Assessor] Primary Groq failed: {e}. Falling back to Gemini...")
            evaluator = ChatGoogleGenerativeAI(
                model=GEMINI_EVAL_MODEL,
                temperature=0.1,
                max_retries=1,
                api_key=os.getenv("GOOGLE_API_KEY", "")
            )
            res = evaluator.invoke([HumanMessage(content=prompt)])
    else:
        try:
            api_key = os.getenv("GOOGLE_API_KEY", "")
            if not api_key or api_key == "dummy_key":
                raise ValueError("Google API key missing")
            evaluator = ChatGoogleGenerativeAI(
                model=GEMINI_EVAL_MODEL, 
                temperature=0.1, 
                max_retries=1,
                api_key=api_key
            )
            res = evaluator.invoke([HumanMessage(content=prompt)])
        except Exception as e:
            print(f"[Assessor] Primary Gemini failed: {e}. Falling back to Groq {GROQ_EVAL_MODEL}...")
            evaluator = ChatGroq(
                model=GROQ_EVAL_MODEL,
                temperature=0,
                api_key=os.getenv("GROQ_API_KEY", "")
            )
            res = evaluator.invoke([HumanMessage(content=prompt)])


    content = res.content
    if "{" in content:
        content = content[content.find("{"):content.rfind("}")+1]
        
    return json.loads(content)

def _save_and_publish_sync(session_id: str, scorecard: dict):
    """Save evaluation to database and publish to Redis pub/sub if available."""
    # 1. Save to DB
    if sync_session_maker:
        try:
            with sync_session_maker() as db:
                db_session = db.query(Session).filter(Session.id == session_id).first()
                if db_session:
                    db_session.status = "completed"
                evaluation = Evaluation(session_id=session_id, scorecard=scorecard)
                db.add(evaluation)
                db.commit()
                print(f"[Assessor] Successfully saved scorecard to DB for session {session_id}")
        except Exception as db_err:
            print(f"[Assessor] DB save error: {db_err}")

    # 2. Publish to Redis for WebSocket client (if Redis is running)
    try:
        redis_url = os.getenv("CELERY_BROKER_URL", "redis://redis:6379/0")
        if "redis:6379" not in redis_url or os.getenv("DOCKER_CONTAINER"):
            r = redis.from_url(redis_url, socket_connect_timeout=1.0)
            r.publish(f"autohire_eval_{session_id}", json.dumps(scorecard))
            r.close()
    except Exception:
        pass

def run_evaluation_sync(session_id: str, job_title: str, messages: list) -> dict:
    """Core synchronous evaluation logic, saving to DB and returning scorecard."""
    try:
        history_msgs = []
        for m in messages:
            m_type = m.get("type", "") if isinstance(m, dict) else getattr(m, "type", "")
            m_content = m.get("content", "") if isinstance(m, dict) else getattr(m, "content", "")
            if m_type in ("human", "ai") and "TAB_SWITCH_DETECTED" not in m_content:
                history_msgs.append(f"{m_type}: {m_content}")
                
        history = "\n".join(history_msgs)
        if not history:
            history = "Candidate participated in technical interview."

        scorecard = _generate_scorecard_sync(job_title, history)
        _save_and_publish_sync(session_id, scorecard)
        return scorecard
    except Exception as exc:
        print(f"[Assessor Task Error] {exc}")
        return {"error": str(exc)}

@celery_app.task(name="app.workers.assessor.evaluate_candidate_task", bind=True, max_retries=2)
def evaluate_candidate_task(self, session_id: str, job_title: str, messages: list):
    """Celery background worker task for comprehensive evaluation."""
    res = run_evaluation_sync(session_id, job_title, messages)
    if "error" in res and hasattr(self, 'retry') and self.request.retries < 2:
        raise self.retry(exc=Exception(res["error"]), countdown=5)
    return res

async def evaluate_candidate(session_id: str, job_title: str, messages: list):
    """
    Dispatcher: Always computes and returns the scorecard dict reliably.
    If Redis/Celery is unavailable (e.g. running outside Docker), runs immediately
    in executor without blocking or dropping.
    """
    broker_url = os.getenv("CELERY_BROKER_URL", "")
    use_celery = "redis:6379" not in broker_url and bool(broker_url)

    if use_celery:
        try:
            task = evaluate_candidate_task.apply_async(args=[session_id, job_title, messages], connect_timeout=1.0)
            print(f"[Assessor] Dispatched Celery task ID: {task.id} for session: {session_id}")
            return {"status": "queued", "task_id": task.id}
        except Exception as e:
            print(f"[Assessor] Celery dispatch failed ({e}). Running in executor...")

    # Run directly in thread pool executor with high performance
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, run_evaluation_sync, session_id, job_title, messages)


