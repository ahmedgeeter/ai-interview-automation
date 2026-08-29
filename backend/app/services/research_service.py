from typing import TypedDict, Annotated, Sequence
from langchain_core.messages import HumanMessage, BaseMessage
from langchain_community.tools import DuckDuckGoSearchRun
from langchain_groq import ChatGroq
from langchain_google_genai import ChatGoogleGenerativeAI
from langgraph.graph import END, StateGraph
import operator
import os
import asyncio
from app.models import state

FAST_MODEL = "qwen/qwen3.8-27b"

class ResearchState(TypedDict):
    messages: Annotated[Sequence[BaseMessage], operator.add]
    job_title: str
    interview_type: str
    search_query: str
    search_results: str
    domain_context: str

async def generate_search_query(state_input: ResearchState):
    job_title = state_input["job_title"]
    interview_type = state_input["interview_type"]
    # Target real company questions
    query = f"site:glassdoor.com OR site:levels.fyi {job_title} {interview_type} interview questions 2024"
    return {"search_query": query}

async def perform_search(state_input: ResearchState):
    search = DuckDuckGoSearchRun()
    query = state_input["search_query"]
    # Run synchronous search in a thread (non-blocking)
    results = await asyncio.to_thread(search.invoke, query)
    return {"search_results": results}

async def generate_rubric(state_input: ResearchState):
    job_title = state_input["job_title"]
    interview_type = state_input["interview_type"]
    search_results = state_input.get("search_results", "")
    
    prompt = f"""You are an elite technical recruiter. Based ONLY on the following real company search results, 
create a concise, highly accurate interview rubric for a {job_title} ({interview_type} focus).

List exactly 5 key, highly-specific topics/questions with brief evaluation criteria.
Focus ONLY on the exact skills needed for {job_title}. Be direct. No filler text.

Search Results:
{search_results[:3000]}"""

    try:
        llm = ChatGoogleGenerativeAI(
            model="gemini-flash-latest",
            temperature=0.1,
            max_tokens=600,
            api_key=os.getenv("GOOGLE_API_KEY", "")
        )
        response = await llm.ainvoke([HumanMessage(content=prompt)])
    except Exception as e:
        print(f"[Research] Gemini failed: {e}. Falling back to Groq...")
        llm = ChatGroq(
            model=FAST_MODEL,
            temperature=0.1,
            max_tokens=600,
            api_key=os.getenv("GROQ_API_KEY", "")
        )
        response = await llm.ainvoke([HumanMessage(content=prompt)])
        
    return {"domain_context": response.content}

# Build the Graph
workflow = StateGraph(ResearchState)
workflow.add_node("generate_search_query", generate_search_query)
workflow.add_node("perform_search", perform_search)
workflow.add_node("generate_rubric", generate_rubric)

workflow.set_entry_point("generate_search_query")
workflow.add_edge("generate_search_query", "perform_search")
workflow.add_edge("perform_search", "generate_rubric")
workflow.add_edge("generate_rubric", END)

research_graph = workflow.compile()

async def fetch_domain_context(session_id: str, job_title: str, interview_type: str):
    """
    Fetches domain context using a LangGraph real-time web search workflow.
    Executes entirely in the background.
    """
    try:
        result = await research_graph.ainvoke({
            "job_title": job_title,
            "interview_type": interview_type,
            "messages": []
        })
        domain_context = result["domain_context"]
        
        if session_id in state.pending_sessions:
            state.pending_sessions[session_id]["domain_context"] = domain_context
            print(f"[Research] Domain context ready for session {session_id[:8]}")
    except Exception as e:
        print(f"[Research] Failed for {session_id[:8]}: {e}")
        if session_id in state.pending_sessions:
            state.pending_sessions[session_id]["domain_context"] = (
                f"Focus on core {interview_type} concepts for {job_title}: "
                "system design, data structures, algorithms, domain knowledge."
            )
