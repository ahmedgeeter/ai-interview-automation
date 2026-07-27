import asyncio
import json
import os
from langchain_groq import ChatGroq
from langchain_core.messages import HumanMessage
from app.models.database import async_session_maker
from sqlalchemy import select
from app.models.models import Evaluation, Session

async def evaluate_candidate(session_id: str, job_title: str, messages: list):
    """
    Run the Assessor Agent asynchronously in the background.
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
        
        evaluator = ChatGroq(
            model="llama-3.3-70b-versatile",
            temperature=0,
            api_key=os.getenv("GROQ_API_KEY", "dummy_key")
        )
        res = await asyncio.to_thread(evaluator.invoke, [HumanMessage(content=prompt)])
        
        content = res.content
        if "{" in content:
            content = content[content.find("{"):content.rfind("}")+1]
            
        scorecard = json.loads(content)
        
        # Save to database asynchronously
        async with async_session_maker() as db:
            result = await db.execute(select(Session).filter(Session.id == session_id))
            db_session = result.scalars().first()
            if db_session:
                db_session.status = "completed"
                evaluation = Evaluation(session_id=session_id, scorecard=scorecard)
                db.add(evaluation)
                await db.commit()
            return scorecard
            
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"Evaluation task failed for {session_id}: {e}")
        return {"error": str(e)}
