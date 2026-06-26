import os
import json
import random
import uuid
import time
from langchain_groq import ChatGroq
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
from langchain_community.tools import DuckDuckGoSearchRun
from app.graph.state import InterviewState
from dotenv import load_dotenv

load_dotenv()

# Initialize the Primary Groq LLM
primary_llm = ChatGroq(model="llama-3.3-70b-versatile", temperature=0.7)
primary_evaluator_llm = ChatGroq(model="llama-3.3-70b-versatile", temperature=0.1)

# Initialize the Fallback Gemini LLM (Line of Defense)
fallback_llm = ChatGoogleGenerativeAI(model="gemini-2.5-flash", temperature=0.7)
fallback_evaluator_llm = ChatGoogleGenerativeAI(model="gemini-2.5-flash", temperature=0.1)

def interviewer_node(state: InterviewState):
    """
    Drives the technical assessment.
    Formulates highly contextual, deeper follow-up questions.
    Dynamically addresses tab-switching if detected.
    """
    messages = state.get("messages", [])
    job_title = state.get("job_title", "Software Engineer")
    cheat_signals = state.get("cheat_signals", 0)
    latest_cheat = state.get("latest_cheat_detected", False)
    domain_context = state.get("domain_context", "")
    question_count = state.get("question_count", 0)
    
    # Check for domain context from parallel background search
    if question_count == 0 and not domain_context:
        domain_context = "Standard technical concepts for the role."

    # Seniority Calibration
    is_junior = "junior" in job_title.lower() or "intern" in job_title.lower() or "entry" in job_title.lower()
    
    persona = state.get("persona", "balanced")
    
    # Base Interviewer Setup
    system_prompt = f"You are an Engineering Interviewer for a {job_title} position.\n"
    
    # Persona Injection
    if persona == "strict":
        system_prompt += "Your persona is STRICT and INTIMIDATING. You are conducting a stress interview. Be cold, highly critical of any hesitations, and apply intense pressure. Demand perfection. Do NOT be polite.\n"
    elif persona == "supportive":
        system_prompt += "Your persona is SUPPORTIVE and GUIDING. You are a warm mentor. If the candidate struggles, offer gentle hints to guide them to the right answer. Praise them when they do well.\n"
    else:
        system_prompt += "Your persona is BALANCED and PROFESSIONAL. You are a rigorous but fair interviewer. Ask deep, contextual follow-up questions. Do not be overly polite, but remain professional.\n"

    interview_type = state.get("interview_type", "technical")
    language = state.get("language", "en")
    
    system_prompt += "\n"
    if interview_type == "hr":
        system_prompt += "Your goal is to conduct a purely HR / Behavioral interview. Ask about cultural fit, conflict resolution, leadership, and past experiences using the STAR method. Do NOT ask technical coding questions.\n"
    elif interview_type == "mixed":
        system_prompt += "Your goal is to conduct a Mixed interview. Alternate between assessing technical depth and behavioral/HR questions (cultural fit, conflict resolution).\n"
    else:
        system_prompt += "Your goal is to assess technical depth, problem-solving skills, and architecture knowledge. DO NOT ask generic behavioral questions.\n"
        
    system_prompt += "CRITICAL INSTRUCTION: You MUST ask only ONE short, highly realistic technical question. The question MUST be exactly 1 to 2 sentences maximum. Do NOT yap, do NOT provide long monologues, and do NOT use Markdown or emojis. Output ONLY plain text.\n"
    
    if language == "ar":
        system_prompt += "\nCRITICAL LANGUAGE INSTRUCTION: You MUST conduct this entire interview STRICTLY in Arabic using standard Arabic letters. UNDER NO CIRCUMSTANCES may you output French, Russian, Spanish, or any language other than Arabic. You will be heavily penalized if you generate random foreign words (e.g., 'données', 'против'). Do not use English unless referring to specific coding syntax.\n"

    if is_junior:
        system_prompt += "This is a JUNIOR role. Do NOT ask for complex mathematical equations, deep internal memory architectures, or system-level kernel details unless the user brings them up. Focus heavily on core concepts, fundamental usage, syntax, and basic practical problem-solving. Make the questions approachable but still technical.\n"
    else:
        system_prompt += "This is a MID-LEVEL to SENIOR role. Push the candidate on system design, trade-offs, internal architectures, scaling strategies, and complex edge cases. Do not ask basic syntax questions.\n"

    cv_text = state.get("cv_text")
    if cv_text:
        system_prompt += f"\nCRITICAL CONTEXT: The candidate has provided their CV. You MUST tailor your questions strictly based on the experience, projects, and technologies they claim to know in the CV below. Verify their depth of knowledge on these specific topics. Do NOT ask generic questions if they contradict the CV.\n\n--- CV START ---\n{cv_text}\n--- CV END ---\n"
    else:
        system_prompt += f"\nREAL-TIME ROLE CONTEXT (Use this to ground your questions in current industry standards):\n{domain_context}\n"
    
    if question_count == 0:
        session_seed = str(uuid.uuid4())
        system_prompt += f"\nANTI-REPETITION INSTRUCTION: This is the very first question of the interview. The session seed is {session_seed}. You MUST NOT use a generic greeting. Immediately dive into a completely unique, highly specific technical scenario based on the Real-Time Role Context above. Surprise the candidate with a question they have never seen before.\n"

    system_prompt += "\nLimit your entire response to maximum 2 sentences. Never break character."

    if latest_cheat:
        system_prompt += f"\nCRITICAL INSTRUCTION: The user just switched tabs or minimized the window (potential cheating). Interrupt your normal flow to call them out on this directly and professionally. Warn them that their focus is being monitored. Then, immediately ask a highly complex, unexpected technical question to verify they aren't looking up answers."

    if question_count == 2: # Zero-indexed, so this is the 3rd question
        system_prompt += "\nINTENTIONAL HALLUCINATION TRAP: In this specific question, intentionally inject a subtle but distinct technical inaccuracy into your premise (in the requested language). See if the candidate has the seniority to confidently correct you. If they correct you, praise them later. If they agree, note their lack of deep understanding."

    # Prepend the system prompt to the conversation history
    full_messages = [SystemMessage(content=system_prompt)] + messages
    
    # Gemini requires at least one HumanMessage. If starting, add a silent trigger.
    if not messages:
        full_messages.append(HumanMessage(content="Start the interview."))
    
    try:
        start_time = time.time()
        response = primary_llm.invoke(full_messages)
        latency_ms = int((time.time() - start_time) * 1000)
        
        token_usage = response.response_metadata.get("token_usage", {})
        telemetry = {
            "latency_ms": latency_ms,
            "prompt_tokens": token_usage.get("prompt_tokens", 0),
            "completion_tokens": token_usage.get("completion_tokens", 0),
            "total_tokens": token_usage.get("total_tokens", 0),
            "model_name": response.response_metadata.get("model_name", "llama-3.3-70b-versatile")
        }
    except Exception as e:
        print(f"Groq API Error: {e}. Falling back to Gemini...")
        try:
            start_time = time.time()
            response = fallback_llm.invoke(full_messages)
            latency_ms = int((time.time() - start_time) * 1000)
            telemetry = {
                "latency_ms": latency_ms,
                "prompt_tokens": 0,
                "completion_tokens": 0,
                "total_tokens": 0,
                "model_name": "gemini-2.5-flash (fallback)"
            }
        except Exception as e2:
            print(f"Gemini API Error: {e2}")
            error_msg = "عذراً، حدث خطأ مؤقت في الاتصال بالخادم. هل يمكنك تكرار ما قلته؟" if language == "ar" else "I apologize, but I encountered a temporary network issue. Could you please repeat that?"
            response = AIMessage(content=error_msg)
            telemetry = {
                "latency_ms": 0,
                "prompt_tokens": 0,
                "completion_tokens": 0,
                "total_tokens": 0,
                "model_name": "error-fallback"
            }
    return {
        "messages": [response],
        "question_count": question_count + 1,
        "latest_cheat_detected": False,
        "domain_context": domain_context,
        "telemetry": telemetry
    }


def guardrail_node(state: InterviewState):
    """
    Operates as a parallel security layer.
    Intercepts and analyzes user input prior to reaching the Interviewer Node.
    """
    messages = state.get("messages", [])
    if not messages:
        return {}
        
    last_message = messages[-1]
    
    # Check if the frontend injected a specific "TAB_SWITCH_DETECTED" payload
    # In practice, this might come as a special system message or formatted human message
    if isinstance(last_message, HumanMessage) and "TAB_SWITCH_DETECTED" in last_message.content:
        return {
            "cheat_signals": state.get("cheat_signals", 0) + 1,
            "latest_cheat_detected": True
        }
        
    # Future enhancement: LLM call here to detect Prompt Injection or evasion
    return {}


def evaluator_node(state: InterviewState):
    """
    Executes in the background when the question limit is reached.
    Ingests the transcript and enforces JSON Mode to output a structured evaluation schema.
    """
    messages = state.get("messages", [])
    job_title = state.get("job_title", "Software Engineer")
    cheat_signals = state.get("cheat_signals", 0)
    
    evaluation_prompt = f"""You are an elite Engineering Manager evaluating a candidate for a {job_title} role.
Review the provided conversation transcript carefully.

You MUST output a valid JSON object with the following schema:
{{
    "technical_depth": int (0-100),
    "problem_solving": int (0-100),
    "architecture": int (0-100),
    "integrity": int (0-100),
    "key_strengths": ["list of strings"],
    "key_weaknesses": ["list of strings"],
    "red_flags": ["list of strings"],
    "final_recommendation": "Strong Hire" | "Hire" | "No Hire",
    "recommended_resources": [{{"title": "String", "url": "String", "reason": "String"}}]
}}

CRITICAL EVALUATION RULE:
If the candidate provided no answers, very few answers, or the transcript is extremely short (e.g., they just listened or skipped the questions), you MUST score them 0 across all metrics and recommend "No Hire". Be extremely strict and critical. Do NOT hallucinate positive performance when there is no evidence in the transcript.

The candidate triggered {cheat_signals} tab-switch (cheat) signals during the interview.

Transcript:
"""
    
    transcript = "\n".join([f"{msg.type}: {msg.content}" for msg in messages if msg.type in ("human", "ai") and "TAB_SWITCH_DETECTED" not in msg.content])
    
    full_prompt = evaluation_prompt + transcript
    
    # Primary Evaluator with Fallback
    try:
        response = primary_evaluator_llm.with_structured_output(method="json_mode").invoke([HumanMessage(content=full_prompt)])
    except Exception as e:
        print(f"Groq Evaluator Error: {e}. Falling back to Gemini...")
        try:
            fallback_res = fallback_evaluator_llm.invoke([HumanMessage(content=full_prompt)])
            # Gemini typically wraps json in ```json ... ``` blocks
            content = fallback_res.content
            if "```json" in content:
                content = content.split("```json")[1].split("```")[0]
            elif "```" in content:
                content = content.split("```")[1].split("```")[0]
            response = content.strip()
        except Exception as e2:
            print(f"Gemini Evaluator Error: {e2}")
            response = '{"error": "Evaluation failed"}'
    
    try:
        if isinstance(response, str):
            payload = json.loads(response)
        else:
            # Depending on how langchain_groq handles structured output, it might be a dict already
            payload = response.dict() if hasattr(response, 'dict') else response
    except Exception as e:
        # Fallback empty payload
        payload = {
            "error": "Failed to parse evaluation payload",
            "raw_response": str(response)
        }
        
    return {
        "evaluation_payload": payload
    }
