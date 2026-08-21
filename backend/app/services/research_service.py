from langchain_community.tools import DuckDuckGoSearchRun
from langchain_core.messages import HumanMessage
from langchain_groq import ChatGroq
import os
import asyncio
from app.models import state

# Use the fastest Groq model — llama-3.1-8b is 3x faster than 70b for rubric generation
FAST_MODEL = "llama-3.1-8b-instant"

async def fetch_domain_context(session_id: str, job_title: str, interview_type: str):
    """
    Fetches domain context in the background BEFORE the interview starts.
    Uses DuckDuckGo for real-time web search + fast Groq inference for rubric.
    """
    try:
        search = DuckDuckGoSearchRun()
        query = f"most common {interview_type} interview questions for {job_title} role 2024"

        # Run synchronous search in a thread (non-blocking)
        search_results = await asyncio.to_thread(search.invoke, query)

        prompt = f"""You are an expert technical recruiter. Based on these search results, 
create a concise, highly accurate interview rubric for a {job_title} ({interview_type} focus).

List exactly 5 key, highly-specific topics/questions with brief evaluation criteria.
Focus ONLY on the exact skills needed for {job_title}. Be direct. No filler text.

Search Results:
{search_results[:2000]}"""

        llm = ChatGroq(
            model=FAST_MODEL,
            temperature=0.1,
            max_tokens=600,
            api_key=os.getenv("GROQ_API_KEY", "")
        )
        response = await llm.ainvoke([HumanMessage(content=prompt)])

        if session_id in state.pending_sessions:
            state.pending_sessions[session_id]["domain_context"] = response.content
            print(f"[Research] Domain context ready for session {session_id[:8]}")
    except Exception as e:
        print(f"[Research] Failed for {session_id[:8]}: {e}")
        if session_id in state.pending_sessions:
            state.pending_sessions[session_id]["domain_context"] = (
                f"Focus on core {interview_type} concepts for {job_title}: "
                "system design, data structures, algorithms, domain knowledge."
            )
