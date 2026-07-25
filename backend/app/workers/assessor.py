import asyncio
import json
import os
from app.workers.celery_app import celery_app
from langchain_groq import ChatGroq
from langchain_core.messages import HumanMessage
from sqlalchemy.orm import sessionmaker
from sqlalchemy import create_engine
from app.models.models import Evaluation, Session

# Using sync engine for celery task since it's easier in celery context
POSTGRES_URL_SYNC = os.getenv("POSTGRES_URL", "postgresql://aegra:aegra@postgres:5432/aegra")
if POSTGRES_URL_SYNC.startswith("postgresql+asyncpg"):
    POSTGRES_URL_SYNC = POSTGRES_URL_SYNC.replace("postgresql+asyncpg", "postgresql")

engine = create_engine(POSTGRES_URL_SYNC)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

@celery_app.task(name="evaluate_candidate")
def evaluate_candidate(session_id: str, job_title: str, messages: list):
    """
    Run the Assessor Agent synchronously in the background worker.
    """
    try:
        # Reconstruct transcript
        history_msgs = []
        for m in messages:
            m_type = m.get("type", "")
            m_content = m.get("content", "")
            if m_type in ("human", "ai"):
                history_msgs.append(f"{m_type}: {m_content}")
                
        history = "\n".join(history_msgs)
        if not history:
            return {"error": "No interview history"}

        prompt = f"Evaluate the following transcript for a {job_title} role. Output strictly JSON with keys: technical_score (0-100), communication_score (0-100), problem_solving_score (0-100), feedback (string). Transcript:\n{history}"
        
        evaluator = ChatGroq(model="llama-3.3-70b-versatile", temperature=0)
        res = evaluator.invoke([HumanMessage(content=prompt)])
        
        content = res.content
        if "{" in content:
            content = content[content.find("{"):content.rfind("}")+1]
            
        scorecard = json.loads(content)
        
        # Save to database
        db = SessionLocal()
        try:
            db_session = db.query(Session).filter(Session.id == session_id).first()
            if db_session:
                db_session.status = "completed"
                evaluation = Evaluation(session_id=session_id, scorecard=scorecard)
                db.add(evaluation)
                db.commit()
            return scorecard
        finally:
            db.close()
            
    except Exception as e:
        print(f"Evaluation task failed for {session_id}: {e}")
        return {"error": str(e)}
