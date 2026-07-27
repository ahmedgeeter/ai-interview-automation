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
# from langfuse.callback import CallbackHandler
import asyncio
load_dotenv()

# Initialize Langfuse Callback
# langfuse_handler = CallbackHandler()

primary_llm = ChatGoogleGenerativeAI(model="gemini-1.5-flash", temperature=0.7, api_key=os.getenv("GOOGLE_API_KEY", "dummy_key"))
primary_evaluator_llm = ChatGoogleGenerativeAI(model="gemini-1.5-flash", temperature=0.1, api_key=os.getenv("GOOGLE_API_KEY", "dummy_key"))

# Initialize the Fallback Groq LLM (Line of Defense)
fallback_llm = ChatGroq(
    model="llama-3.3-70b-versatile",
    temperature=0.7,
    api_key=os.getenv("GROQ_API_KEY", "dummy_key")
)
fallback_evaluator_llm = ChatGroq(
    model="llama-3.3-70b-versatile",
    temperature=0.1,
    api_key=os.getenv("GROQ_API_KEY", "dummy_key")
)


async def interviewer_node(state: InterviewState):
    """
    Drives the technical assessment.
    Formulates highly contextual, deeper follow-up questions.
    Dynamically addresses tab-switching if detected.
    """
    print(f"----- INSIDE NODES.PY: State is {state} -----")
    messages = state.get("messages", [])
    job_title = state.get("job_title", "Software Engineer")
    persona = state.get("persona", "balanced")
    interview_type = state.get("interview_type", "technical")
    domain_context = state.get("domain_context", "")
    language = state.get("language", "en")
    
    # Fallback to extract language from first message if LangGraph drops state update
    if messages and hasattr(messages[0], "content") and "[LANGUAGE:ar-eg]" in messages[0].content:
        language = "ar-eg"
    elif messages and hasattr(messages[0], "content") and "[LANGUAGE:ar]" in messages[0].content:
        language = "ar"
    
    cheat_signals = state.get("cheat_signals", 0)
    latest_cheat = state.get("latest_cheat_detected", False)
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
        
    system_prompt += f"STRICT DOMAIN BOUNDARY: You MUST NOT ask generic Software Engineering questions (like what is an API, what is Git, what is Agile) unless they are highly specific to the {job_title} role. For a {job_title} role, focus EXCLUSIVELY on the core technologies, frameworks, and architecture patterns native to this specific domain.\n"
    system_prompt += "CRITICAL INSTRUCTION: You MUST ask only ONE short, highly realistic technical question. The question MUST be exactly 1 to 2 sentences maximum. Do NOT yap, do NOT provide long monologues, and do NOT use Markdown or emojis. Output ONLY plain text.\n"
    
    # Language instruction moved to the end of the prompt to prevent English context override

    interview_context = state.get("interview_context")
    if interview_context and interview_type != "hr":
        system_prompt += f"\nCRITICAL RUBRIC: You are an expert technical interviewer. Use the following dynamically fetched questions and answers as your primary rubric. Do not ask all questions at once. Ask them sequentially, listen to the candidate, and subtly compare their answer to the expected answer in the rubric:\n{interview_context}\n"

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
        system_prompt += f"\nANTI-REPETITION INSTRUCTION: This is the very first question of the interview. The session seed is {session_seed}. You MUST NOT use a generic greeting. Immediately dive into a completely unique, highly specific technical scenario based on the Real-Time Role Context above. Surprise the candidate with a question they have never seen before. MOST IMPORTANTLY: You MUST translate this first question into the requested language (Egyptian Arabic if ar-eg, or Formal Arabic if ar) before you output it!\n"

    system_prompt += "\nLimit your entire response to maximum 2 sentences. Never break character."

    if latest_cheat:
        system_prompt += f"\nCRITICAL INSTRUCTION: The user just switched tabs or minimized the window (potential cheating). Interrupt your normal flow to call them out on this directly and professionally. Warn them that their focus is being monitored. Then, immediately ask a highly complex, unexpected technical question to verify they aren't looking up answers."

    if question_count == 2: # Zero-indexed, so this is the 3rd question
        system_prompt += "\nINTENTIONAL HALLUCINATION TRAP: In this specific question, intentionally inject a subtle but distinct technical inaccuracy into your premise (in the requested language). See if the candidate has the seniority to confidently correct you. If they correct you, praise them later. If they agree, note their lack of deep understanding."

    if language == "ar-eg":
        system_prompt += "\nCRITICAL BINDING INSTRUCTION: You MUST formulate your NEXT QUESTION STRICTLY in Egyptian Arabic (اللهجة المصرية العامية). YOU MUST USE ONLY THE ARABIC ALPHABET (حروف عربية). DO NOT output any Chinese (汉字), Russian, or other foreign characters. Use Egyptian conversational phrasing naturally. DO NOT use Formal Standard Arabic (Fusha).\n"
        system_prompt += "ANTI-HALLUCINATION: NEVER translate technical terms (like System, Design, Performance, Database). You MUST keep technical terms in English letters. ABSOLUTELY NO CHINESE OR FOREIGN CHARACTERS. Example: write 'Performance', NEVER '性能'.\n"
        system_prompt += "TEXT PROCESSING RULES FOR TTS (EGYPTIAN):\n"
        system_prompt += "1. NO DIACRITICS: Do NOT output any diacritics (بدون تشكيل) in your text. Keep the text clean for the UI.\n"
        system_prompt += "2. EGYPTIAN DIALECT SPELLING CONVENTIONS:\n"
        system_prompt += "   - Use authentic Egyptian vocabulary ('إزيك'، 'كده'، 'عايز'، 'إيه'، 'علشان'، 'مش'، 'النهاردة').\n"
        system_prompt += "   - Spell out numbers phonetically as spoken in Egyptian Arabic (e.g., write 'خمسة' instead of '5', 'عشرين' instead of '20').\n"
    elif language == "ar":
        system_prompt += "\nCRITICAL BINDING INSTRUCTION: You MUST formulate your NEXT QUESTION STRICTLY in Formal Standard Arabic (اللغة العربية الفصحى). YOU MUST USE ONLY THE ARABIC ALPHABET (حروف عربية). DO NOT USE FRANCO-ARABIC OR ENGLISH LETTERS FOR ARABIC WORDS. DO NOT output any Chinese, Russian, or other foreign characters. UNDER NO CIRCUMSTANCES may you output French, Russian, Spanish, or any language other than Arabic. Even though your context is in English, you MUST translate and speak in Formal Standard Arabic. Do not use English unless referring to specific coding syntax.\n"
        system_prompt += "TEXT PROCESSING RULES FOR TTS:\n- Ensure correct grammatical endings (الإعراب) and add diacritics (التشكيل) where necessary to prevent mispronunciation by the text-to-speech engine.\n"
    else:
        system_prompt += "\nCRITICAL BINDING INSTRUCTION: You MUST formulate your NEXT QUESTION STRICTLY in English.\n"

    # Prepend the system prompt to the conversation history
    full_messages = [SystemMessage(content=system_prompt)] + messages
    
    # Gemini requires at least one HumanMessage. If starting, add a silent trigger.
    first_msg_content = messages[0].get("content", "") if messages and isinstance(messages[0], dict) else (getattr(messages[0], "content", "") if messages else "")
    if not messages or (len(messages) == 1 and "Start the interview" in first_msg_content):
        trigger_msg = "Start the interview. Ask the first question now."
        if language == "ar-eg":
            trigger_msg += " CRITICAL: Ask the question entirely in Egyptian Arabic (اللهجة المصرية). No foreign characters."
        elif language == "ar":
            trigger_msg += " CRITICAL: Ask the question entirely in Formal Standard Arabic (الفصحى). No foreign characters."
            
        if not messages:
            full_messages.append(HumanMessage(content=trigger_msg))
        else:
            full_messages[-1] = HumanMessage(content=trigger_msg)
    
    try:
        start_time = time.time()
        print(f"----- DEBUG LOG: language state is {language} -----")
        print("----- DEBUG LOG: FULL MESSAGES BEING SENT -----")
        sanitized_messages = []
        for m in full_messages:
            if isinstance(m, dict):
                m_type = m.get("type", "human")
                m_content = m.get("content", "")
                if m_type == "ai":
                    sanitized_messages.append(AIMessage(content=m_content))
                else:
                    sanitized_messages.append(HumanMessage(content=m_content))
            else:
                sanitized_messages.append(m)
                
        for m in sanitized_messages:
            m_type = getattr(m, "type", "unknown")
            print(f"{m_type}: {m.content}")
        print("-----------------------------------------------")
        response = await primary_llm.ainvoke(sanitized_messages)
        
        # Check for Chinese Hallucination (Just in case Groq is the fallback or Gemini slips up)
        import re
        if re.search(r'[\u4e00-\u9fff]', response.content):
            print("LLM hallucinated Chinese! Falling back to secondary...")
            raise ValueError("Chinese hallucination detected")
            
        latency_ms = int((time.time() - start_time) * 1000)
        
        token_usage = response.response_metadata.get("token_usage", {}) if hasattr(response, "response_metadata") else {}
        telemetry = {
            "latency_ms": latency_ms,
            "prompt_tokens": token_usage.get("prompt_tokens", 0),
            "completion_tokens": token_usage.get("completion_tokens", 0),
            "total_tokens": token_usage.get("total_tokens", 0),
            "model_name": "gemini-1.5-flash (primary)"
        }
    except Exception as e:
        print(f"Primary LLM Error: {e}. Falling back to Groq...")
        try:
            start_time = time.time()
            response = await fallback_llm.ainvoke(sanitized_messages)
            
            if re.search(r'[\u4e00-\u9fff]', response.content):
                # Clean up if Groq hallucinates on fallback
                response.content = re.sub(r'[\u4e00-\u9fff]+', '', response.content)

            latency_ms = int((time.time() - start_time) * 1000)
            telemetry = {
                "latency_ms": latency_ms,
                "prompt_tokens": 0,
                "completion_tokens": 0,
                "total_tokens": 0,
                "model_name": "llama-3.3-70b-versatile (fallback)"
            }
        except Exception as e2:
            print(f"Gemini API Error: {e2}")
            error_msg = f"[DEBUG API ERROR] Gemini failed: {e} | Groq failed: {e2}. Please check your API Keys in Render Environment Variables!"
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


async def guardrail_node(state: InterviewState):
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
    last_content = last_message.get("content", "") if isinstance(last_message, dict) else last_message.content
    last_type = last_message.get("type", "") if isinstance(last_message, dict) else getattr(last_message, "type", "")
    if last_type == "human" and "TAB_SWITCH_DETECTED" in last_content:
        return {
            "cheat_signals": state.get("cheat_signals", 0) + 1,
            "latest_cheat_detected": True
        }
        
    # Future enhancement: LLM call here to detect Prompt Injection or evasion
    return {}


async def evaluator_node(state: InterviewState):
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

CRITICAL EVALUATION RUBRIC:
1. Evidence-Based Scoring: You MUST calculate scores strictly based on the candidate's ACTUAL answers in the transcript. Do NOT invent or assume knowledge they did not explicitly demonstrate.
2. The "Zero" Rule: If a candidate skips a question, gives a vague non-answer (e.g., "I don't know", "Yes", "Next"), or abandons the interview, you MUST give a score of 0 for that specific interaction.
3. Strict Mathematical Averages: If you ask 5 questions and they only answer 1 well, their final score should mathematically be around 20/100, NOT 80/100.
4. Penalize Buzzwords: If the candidate uses buzzwords without explaining the underlying mechanism, deduct points heavily.
5. Base Zero: Assume the candidate starts at 0 points. They must earn points through detailed, technically accurate answers. Do NOT start from 100 and deduct.
6. Actionable Feedback: Provide deep, hyper-specific feedback on what they need to study next to pass this exact role.
7. Anti-404 URLs Rule: DO NOT hallucinate URLs in recommended_resources. Only provide links to highly authoritative, permanent official domains (e.g., https://react.dev, https://docs.python.org, https://aws.amazon.com/architecture). Do NOT link to specific blog posts, medium articles, or sub-pages that might be 404. If unsure, just provide the search term as the URL.
8. Recommendation: If the overall average is below 60, recommend "No Hire". If between 60 and 85, recommend "Hire". Above 85 is "Strong Hire".

The candidate triggered {cheat_signals} tab-switch (cheat) signals during the interview.

Transcript:
"""
    
    sanitized_messages = []
    for msg in messages:
        msg_type = msg.get("type", "") if isinstance(msg, dict) else getattr(msg, "type", "")
        msg_content = msg.get("content", "") if isinstance(msg, dict) else getattr(msg, "content", "")
        sanitized_messages.append({"type": msg_type, "content": msg_content})

    transcript = "\n".join([f"{msg['type']}: {msg['content']}" for msg in sanitized_messages if msg['type'] in ("human", "ai") and "TAB_SWITCH_DETECTED" not in msg['content']])
    
    # Pre-flight check: Did the candidate actually answer?
    human_messages = [msg['content'] for msg in sanitized_messages if msg['type'] == "human" and "TAB_SWITCH_DETECTED" not in msg['content']]
    total_human_words = sum(len(m.split()) for m in human_messages)
    
    if total_human_words < 10:
        language = state.get("language", "en")
        is_ar = language == "ar"
        return {
            "evaluation_payload": {
                "technical_depth": 0,
                "problem_solving": 0,
                "architecture": 0,
                "communication": 0,
                "integrity": 0,
                "key_strengths": ["لا يوجد أداء لتقييمه" if is_ar else "No performance to evaluate"],
                "key_weaknesses": ["لم يجب على الأسئلة التقنية" if is_ar else "Did not answer the technical questions", "تهرب من المقابلة" if is_ar else "Abandoned or skipped the interview"],
                "red_flags": ["لم يقدم المرشح أي إجابات فعلية لتقييم مستواه." if is_ar else "Candidate provided no substantive answers."],
                "final_recommendation": "No Hire",
                "recommended_resources": []
            }
        }
        
    full_prompt = evaluation_prompt + transcript
    
    # Primary Evaluator with Fallback
    try:
        # Gemini does not natively support .with_structured_output in the same way Groq does sometimes, 
        # but LangChain handles it for Gemini.
        response_obj = await primary_evaluator_llm.with_structured_output(method="json_mode").ainvoke([HumanMessage(content=full_prompt)])
        response = response_obj
    except Exception as e:
        print(f"Primary Evaluator Error: {e}. Falling back to Groq...")
        try:
            fallback_res = await fallback_evaluator_llm.ainvoke([HumanMessage(content=full_prompt)])
            # Try parsing Groq's raw output
            content = fallback_res.content
            if "```json" in content:
                content = content.split("```json")[1].split("```")[0]
            elif "```" in content:
                content = content.split("```")[1].split("```")[0]
            response = content.strip()
        except Exception as e2:
            print(f"Fallback Evaluator Error: {e2}")
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
