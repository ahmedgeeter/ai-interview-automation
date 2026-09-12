import os
import asyncio
import re
import operator
from typing import TypedDict, Annotated, Sequence, Optional
from dotenv import load_dotenv

from langchain_core.messages import HumanMessage, BaseMessage
from langchain_community.utilities.duckduckgo_search import DuckDuckGoSearchAPIWrapper
from langchain_groq import ChatGroq
from langchain_google_genai import ChatGoogleGenerativeAI
from langgraph.graph import END, StateGraph

from app.models import state

load_dotenv()

FAST_MODEL = os.getenv("GROQ_FAST_MODEL", os.getenv("GROQ_MODEL", "qwen/qwen3.8-27b"))
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")

class ResearchState(TypedDict):
    messages: Annotated[Sequence[BaseMessage], operator.add]
    job_title: str
    interview_type: str
    cv_text: Optional[str]
    search_query: str
    search_results: str
    domain_context: str

async def generate_search_query(state_input: ResearchState) -> dict:
    job_title = state_input.get("job_title", "Software Engineer")
    interview_type = state_input.get("interview_type", "technical")
    cv_text = state_input.get("cv_text") or ""

    # Determine seniority from job title
    seniority = "senior" if any(w in job_title.lower() for w in ["senior", "lead", "staff", "principal", "architect"]) else "standard"

    # If CV provided, extract prominent technology keywords
    cv_keywords = []
    if cv_text:
        common_tech = [
            "python", "pytorch", "tensorflow", "kubernetes", "docker", "kafka", "redis",
            "postgresql", "mongodb", "fastapi", "django", "react", "next.js", "typescript",
            "golang", "rust", "aws", "gcp", "azure", "graphql", "microservices", "langchain",
            "langgraph", "vllm", "tensorrt", "spark", "airflow", "triton", "llm"
        ]
        found = [tech for tech in common_tech if tech in cv_text.lower()]
        cv_keywords = found[:4]

    if cv_keywords:
        tech_str = " ".join(cv_keywords)
        query = f"{job_title} {tech_str} production architecture interview questions real world trade-offs"
    else:
        query = f"{job_title} real world production architecture challenges trade-offs interview questions 2025"

    return {"search_query": query}

async def perform_search(state_input: ResearchState) -> dict:
    query = state_input.get("search_query", "")
    job_title = state_input.get("job_title", "Software Engineer")
    interview_type = state_input.get("interview_type", "technical")

    results = ""
    try:
        wrapper = DuckDuckGoSearchAPIWrapper(max_results=3)
        results = await asyncio.wait_for(
            asyncio.to_thread(wrapper.run, query),
            timeout=2.0
        )
    except Exception as e:
        print(f"[Research] Live search notice: {e}. Utilizing high-signal architectural synthesis.")
        results = (
            f"Production engineering standards for {job_title} ({interview_type}): "
            "Focus on distributed systems scaling, latency bottlenecks, microservice fault isolation, "
            "database connection pooling, cache stampede prevention, data consistency (CAP theorem), "
            "asynchronous event streaming, memory profiling, and observability."
        )

    # Sanitize and bound result length
    results = re.sub(r'\s+', ' ', results).strip()[:3500]
    return {"search_results": results}

async def generate_rubric(state_input: ResearchState) -> dict:
    job_title = state_input.get("job_title", "Software Engineer")
    interview_type = state_input.get("interview_type", "technical")
    cv_text = state_input.get("cv_text") or ""
    search_results = state_input.get("search_results", "")

    cv_context_snippet = f"\nCandidate Claimed Experience & Projects:\n{cv_text[:1200]}\n" if cv_text else ""

    prompt = f"""You are a Principal Engineering Bar-Raiser at a top-tier tech enterprise (Micro1 / FAANG level).
Based on the current industry production research below, create an ultra-realistic, scenario-based Technical Assessment Blueprint for a {job_title} ({interview_type} focus).
{cv_context_snippet}
Industry Research & Production Context:
{search_results[:2500]}

Generate a concise, high-impact blueprint with EXACTLY 4 core production scenarios. For each scenario provide:
1. SCENARIO TITLE & CONTEXT: A real-world production incident or architectural challenge (e.g. Black Friday traffic spike, cache stampede, distributed deadlocks, model serving latency budget).
2. THE HARD QUESTION: The exact probing question to test their architectural reasoning and trade-offs.
3. SENIOR VS JUNIOR EVALUATION CRITERIA: What answers prove high seniority vs shallow textbook knowledge.

Be direct, highly technical, and realistic. No fluff or generic intro."""

    groq_api_key = os.getenv("GROQ_API_KEY", "")
    google_api_key = os.getenv("GOOGLE_API_KEY", "")

    # Primary: Groq for sub-second execution (< 700ms)
    if groq_api_key:
        try:
            llm = ChatGroq(
                model=FAST_MODEL,
                temperature=0.2,
                max_tokens=800,
                api_key=groq_api_key
            )
            response = await llm.ainvoke([HumanMessage(content=prompt)])
            return {"domain_context": response.content}
        except Exception as e:
            print(f"[Research] Groq generation notice: {e}. Trying secondary LLM...")

    # Secondary: Gemini
    if google_api_key:
        try:
            llm = ChatGoogleGenerativeAI(
                model=GEMINI_MODEL,
                temperature=0.2,
                max_tokens=800,
                api_key=google_api_key
            )
            response = await llm.ainvoke([HumanMessage(content=prompt)])
            return {"domain_context": response.content}
        except Exception as e:
            print(f"[Research] Secondary Gemini notice: {e}.")

    # Fallback template if all LLMs are unreachable
    fallback = (
        f"**Enterprise Assessment Blueprint for {job_title}**\n\n"
        "1. High-Throughput System Architecture: Probe design of scalable services, backpressure handling, and load-shedding.\n"
        "2. Concurrency & State Management: Probe race conditions, distributed locking, and cache invalidation strategies.\n"
        "3. Production Incident Triage: Investigate failure modes under database saturation and cascading timeouts.\n"
        "4. Observability & Latency: Evaluate p99 latency profiling, distributed tracing, and metric alerts."
    )
    return {"domain_context": fallback}

# ── Build LangGraph StateGraph ──
workflow = StateGraph(ResearchState)
workflow.add_node("generate_search_query", generate_search_query)
workflow.add_node("perform_search", perform_search)
workflow.add_node("generate_rubric", generate_rubric)

workflow.set_entry_point("generate_search_query")
workflow.add_edge("generate_search_query", "perform_search")
workflow.add_edge("perform_search", "generate_rubric")
workflow.add_edge("generate_rubric", END)

research_graph = workflow.compile()

# High-efficiency in-memory cache for instant zero-latency repeats
RUBRIC_CACHE: dict = {
    "software engineer::technical": "Production engineering assessment for Software Engineer: Focus on data structures, algorithmic complexity, system modularity, clean APIs, database indexing, concurrency, and fault tolerance.",
    "frontend engineer::technical": "Production frontend assessment: Focus on modern component architecture, state management, SSR/hydration, Core Web Vitals, performance profiling, responsive design, and Web APIs.",
    "backend engineer::technical": "Production backend assessment: Focus on distributed systems, REST/gRPC API design, relational and NoSQL databases, caching strategies (Redis), concurrency, and message brokers (Kafka/RabbitMQ).",
    "full stack engineer::technical": "Production full stack assessment: Focus on end-to-end architecture, API contracts, database modeling, frontend rendering strategies, caching, and CI/CD deployment pipelines.",
    "devops engineer::technical": "Production DevOps & SRE assessment: Focus on Kubernetes orchestration, infrastructure as code (Terraform), CI/CD pipelines, container security, monitoring/alerting (Prometheus/Grafana), and zero-downtime deployments.",
    "data engineer::technical": "Production data engineering assessment: Focus on ETL/ELT pipelines, distributed data processing (Spark), data warehousing (BigQuery/Snowflake), data modeling, streaming (Kafka), and data quality monitoring.",
    "machine learning engineer::technical": "Production ML engineering assessment: Focus on model serving latency, feature stores, model monitoring/drift detection, pipeline orchestration (Kubeflow/Airflow), and distributed training.",
}

async def fetch_domain_context(session_id: str, job_title: str, interview_type: str, cv_text: str = "") -> str:
    """
    Executes real-time web research and scenario rubric generation using LangGraph.
    Provides sub-millisecond responses on cache hit and rapid ~1.5s execution on cold start.
    Updates the session state so Question 1 is immediately grounded in real production context.
    """
    cache_key = f"{job_title.lower().strip()}::{interview_type.lower().strip()}"
    if cv_text:
        # Include a fast hash of CV text in the cache key to differentiate candidates
        cache_key += f"::cv_{hash(cv_text[:300])}"

    # 1. Instant Cache Hit
    if cache_key in RUBRIC_CACHE:
        cached_context = RUBRIC_CACHE[cache_key]
        if session_id in state.pending_sessions:
            state.pending_sessions[session_id]["domain_context"] = cached_context
        print(f"[Research Cache HIT] Loaded instantly for session {session_id[:8]} ({job_title})")
        return cached_context

    # 2. Execute Live LangGraph Research with strict 2.5s ceiling
    try:
        t0 = asyncio.get_event_loop().time()
        result = await asyncio.wait_for(
            research_graph.ainvoke({
                "job_title": job_title,
                "interview_type": interview_type,
                "cv_text": cv_text,
                "messages": []
            }),
            timeout=2.5
        )
        domain_context = result.get("domain_context", "")
        duration = asyncio.get_event_loop().time() - t0
        print(f"[Research Graph Completed] in {duration:.2f}s for {job_title}")

        RUBRIC_CACHE[cache_key] = domain_context
        if session_id in state.pending_sessions:
            state.pending_sessions[session_id]["domain_context"] = domain_context
        return domain_context
    except Exception as e:
        print(f"[Research Graph Exception/Timeout] {e}. Applying high-fidelity fallback.")
        fallback = (
            f"Production engineering assessment for {job_title}: "
            "Focus on real-world system design, trade-offs, edge cases, distributed scaling, and fault tolerance."
        )
        RUBRIC_CACHE[cache_key] = fallback
        if session_id in state.pending_sessions:
            state.pending_sessions[session_id]["domain_context"] = fallback
        return fallback
