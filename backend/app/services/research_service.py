from langchain_community.tools import DuckDuckGoSearchRun
from langchain_core.messages import HumanMessage
from langchain_openai import ChatOpenAI
import os
import asyncio
from app.models import state
def fetch_interview_rubric(job_title: str) -> str:
    """
    Synchronously fetches search results and compiles an interview rubric.
    Will be wrapped in asyncio.to_thread when called from the async graph node.
    """
    try:
        search = DuckDuckGoSearchRun()
        query = f"Top technical interview questions and answers for {job_title} in 2024"
        search_results = search.invoke(query)
        
        prompt = f"""Based on the following search results, compile a strict, technical interview rubric for a {job_title}. 
List the top 5 most common, highly technical questions and their expected correct answers in detail.
Do not yap, just output the rubric formatted cleanly.

Search Results:
{search_results}"""

        # We can use a lightweight or fast model here if latency is a concern, 
        # but llama-3.3-70b-versatile is fine since this runs once before the interview.
        llm = ChatOpenAI(
            model="qwen-turbo-latest", 
            temperature=0.2,
            api_key=os.getenv("DASHSCOPE_API_KEY", "dummy_key"),
            base_url="https://dashscope-intl.aliyuncs.com/compatible-mode/v1"
        )
        response = llm.invoke([HumanMessage(content=prompt)])
        
        return response.content
    except Exception as e:
        print(f"Error fetching rubric: {e}")
        return "Standard technical concepts for the role."

async def fetch_domain_context(session_id: str, job_title: str, interview_type: str):
    """
    Fetches domain context in the background and updates the pending session state.
    """
    try:
        search = DuckDuckGoSearchRun()
        query = f"Top technical {interview_type} interview questions for {job_title} in 2024"
        # Run synchronous search tool in thread
        search_results = await asyncio.to_thread(search.invoke, query)
        
        prompt = f"""Based on the following search results, compile a strict, technical interview rubric for a {job_title} focusing on {interview_type}.
List the top 5 most common, highly technical questions and their expected correct answers in detail.
Do not yap, just output the rubric formatted cleanly.

Search Results:
{search_results}"""

        llm = ChatOpenAI(
            model="qwen-turbo-latest", 
            temperature=0.2,
            api_key=os.getenv("DASHSCOPE_API_KEY", "dummy_key"),
            base_url="https://dashscope-intl.aliyuncs.com/compatible-mode/v1"
        )
        response = await llm.ainvoke([HumanMessage(content=prompt)])
        
        if session_id in state.pending_sessions:
            state.pending_sessions[session_id]["domain_context"] = response.content
            print(f"Domain context loaded for {session_id}")
    except Exception as e:
        print(f"Failed to fetch domain context for {session_id}: {e}")
        if session_id in state.pending_sessions:
            state.pending_sessions[session_id]["domain_context"] = f"Standard {interview_type} concepts for {job_title}."
