import asyncio
import json
import os
from langchain_groq import ChatGroq
from langchain_google_genai import ChatGoogleGenerativeAI
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

        prompt = f"""Evaluate the following transcript for a {job_title} role. Output strictly JSON with keys: 
technical_depth (0-100), communication (0-100), problem_solving (0-100), architecture (0-100), integrity (0-100), 
key_strengths (list of strings), key_weaknesses (list of strings), red_flags (list of strings), 
final_recommendation (string), recommended_resources (list of strings).
Transcript:
{history}"""
        
        try:
            evaluator = ChatGoogleGenerativeAI(
                model="gemini-flash-latest", 
                temperature=0.1, 
                api_key=os.getenv("GOOGLE_API_KEY", "dummy_key")
            )
            res = await asyncio.to_thread(evaluator.invoke, [HumanMessage(content=prompt)])
        except Exception as e:
            print(f"[Assessor] Gemini failed: {e}. Falling back to Groq...")
            evaluator = ChatGroq(
                model="qwen/qwen3.8-27b",
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
                
            # Publish to Redis
            import redis.asyncio as aioredis
            redis_url = os.getenv("CELERY_BROKER_URL", "redis://redis:6379/0")
            redis = aioredis.from_url(redis_url)
            await redis.publish(f"autohire_eval_{session_id}", json.dumps(scorecard))
            await redis.close()
            
            return scorecard
            
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"Evaluation task failed for {session_id}: {e}")
        return {"error": str(e)}
