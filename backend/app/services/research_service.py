from langchain_community.tools import DuckDuckGoSearchRun
from langchain_core.messages import HumanMessage
from langchain_groq import ChatGroq

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
        llm = ChatGroq(model="llama-3.3-70b-versatile", temperature=0.2)
        response = llm.invoke([HumanMessage(content=prompt)])
        
        return response.content
    except Exception as e:
        print(f"Error fetching rubric: {e}")
        return "Standard technical concepts for the role."
