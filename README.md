# AutoHire: AI-Powered Technical Interview System

<div align="center">
  <img src="https://img.shields.io/badge/Status-Production_Ready-success?style=for-the-badge" alt="Status" />
  <img src="https://img.shields.io/badge/Architecture-Event_Driven-blue?style=for-the-badge" alt="Architecture" />
  <img src="https://img.shields.io/badge/Stack-Next.js_|_FastAPI_|_LangGraph-black?style=for-the-badge" alt="Stack" />
</div>

<br />

AutoHire is a real-time AI interview platform designed to conduct technical, behavioral, and mixed interviews. By leveraging multiple Large Language Models (LLMs) and real-time WebSockets, AutoHire provides an automated assessment solution that evaluates candidates, handles edge cases, and scales efficiently.

---

## 1. System Architecture Overview

The platform uses a decoupled, event-driven microservices architecture to separate real-time interactions from heavy evaluation tasks, ensuring low latency during the interview.

### Technology Stack
- **Frontend Layer:** Next.js 14, React, Tailwind CSS. Handles UI state, WebSockets, and browser-native Speech-to-Text (STT).
- **Backend API Layer:** FastAPI (Python) for REST endpoints and WebSocket concurrency.
- **Agentic AI Layer:** LangChain and LangGraph for managing stateful interview workflows.
- **LLM Engine:** 
  - Primary Model: Groq (Llama-3.3-70b-versatile) for fast generation.
  - Fallback Model: Google Gemini 1.5 Flash for reliable, multilingual execution.
- **Asynchronous Processing:** Celery workers backed by Redis for intensive background tasks.
- **Database:** PostgreSQL for conversational state, session configs, and telemetry.
- **Voice Synthesis:** ElevenLabs API with custom phonetic adjustments for localized dialects.

---

## 2. The AI Pipeline (LangGraph)

Instead of traditional request-response calls, AutoHire uses **LangGraph** to model the interview as a state machine.

### State Definition
The system maintains a typed dictionary containing the conversation history, job title, persona, telemetry data, language preference, cheat signals, and a dynamic rubric. 

### Execution Nodes
1. **Guardrail Node:** The entry point that checks current state limits (e.g., maximum questions) and routes the execution.
2. **Interviewer Node:** The conversational engine. It generates technical questions based on the candidate's resume and job context, adjusting its tone based on the candidate's experience level.
3. **Evaluator Node:** A terminal node that performs a comprehensive JSON evaluation of the entire transcript when the interview concludes.

### Streaming
The backend invokes the LangGraph state machine asynchronously and intercepts generated tokens. These are streamed to the frontend via WebSockets as text deltas, creating a realistic typing effect and reducing perceived latency.

---

## 3. Real-Time Communication

AutoHire relies on WebSockets for full-duplex communication between the client and server. 

### Connection Lifecycle
- A WebSocket connection is established when a candidate joins.
- The server fetches the session configuration from PostgreSQL and reconstructs the LangGraph state.
- If the connection drops, the frontend attempts an exponential backoff reconnection. Because the state is persistently checkpointed, the interview resumes exactly where it left off.

### Telemetry and Live Assessment
The backend streams telemetry data (token usage, latency) during the session. Simultaneously, a lightweight asynchronous function evaluates the last few messages to update live progress bars (Technical, Problem Solving, Communication) without blocking the main workflow.

---

## 4. Voice Processing Pipeline

The voice pipeline is optimized for realistic interactions with minimal latency, supporting multiple languages and specific dialects.

### Speech-to-Text (STT)
The frontend uses the native Web Speech API for real-time transcription, sending text directly to the backend instead of large audio files.

### Text-to-Speech (TTS) Middleware
When the AI generates a response, the backend calls the ElevenLabs API to synthesize speech. The audio streams back to the client as Base64 encoded strings and plays via the Web Audio API. 
To ensure reliability, the TTS pipeline uses dynamic key rotation. If the primary key fails (e.g., HTTP 401 or 429), it immediately falls back to a secondary key with zero downtime.

---

## 5. Background Workers

Evaluating a candidate across multiple dimensions requires analyzing the full transcript, which would block the WebSocket thread if done synchronously.

### Celery Integration
AutoHire offloads the final evaluation to an asynchronous Celery worker. 
- When the interview ends, the frontend is notified that the scorecard is generating.
- The Celery worker processes the evaluation prompt, parses the JSON, and saves it to PostgreSQL.
- The frontend redirects to a Scorecard Page that polls the API until the evaluation is ready.

---

## 6. Integrity Mechanisms

Maintaining the integrity of a remote automated interview is important. AutoHire includes built-in behavioral monitoring.

### Tab-Switch Detection
The frontend monitors browser visibility. If the candidate switches tabs, a `tab_switch` signal is sent to the backend.
The backend increments a `cheat_signals` counter. On the next generation cycle, a prompt instruction forces the AI to issue a warning and immediately ask a complex technical question to verify the candidate's knowledge.

---

## 7. Engineering Trade-Offs & Solutions

### Trade-Off A: Dialect Accuracy vs. Clean UI (Egyptian Arabic)
* **The Problem:** Standard TTS engines struggle with localized dialects like Egyptian Arabic without explicit diacritics. However, adding diacritics clutters the chat UI.
* **The Solution:** I built a decoupled phonetic middleware (`tts_service.py`). The LLM outputs clean text for the UI. Before sending it to ElevenLabs, a regex mapping dictionary injects phonetic diacritics exclusively for the audio payload.
* **Result:** Accurate regional pronunciation without affecting the visual chat experience.

### Trade-Off B: Latency vs. Accurate Evaluation
* **The Problem:** Running a large model to evaluate answers synchronously blocked the WebSocket thread, causing delays between questions.
* **The Solution:** The architecture separates concerns: the primary LangGraph node handles fast conversation, while complex evaluation is deferred to a Celery worker. Live progress bars use a restricted rolling context window for instant feedback.

### Trade-Off C: Strict Schema Validation vs. Dynamic Payloads
* **The Problem:** Passing dynamic frontend configs directly into LangGraph caused validation errors (HTTP 422) when unknown keys were present, breaking the connection.
* **The Solution:** A dynamic state sanitizer in the WebSocket controller filters incoming payloads against a strict whitelist matching the LangGraph schema, dropping extraneous variables and ensuring a stable connection loop.

### Trade-Off D: LLM Hallucination in Multi-Lingual Contexts
* **The Problem:** When instructed to speak Arabic while discussing technical concepts, the primary model sometimes hallucinated or poorly translated technical jargon.
* **The Solution:** I added prompt boundaries that strictly enforce English for technical terms. If the primary model fails, the system routes the request to Google Gemini 1.5 Flash, which has better cross-lingual stability.

---

## 8. Deployment

The system is containerized using Docker for consistency across environments.

### Prerequisites
- Docker and Docker Compose
- Node.js 20+ (for frontend)
- Python 3.11+ (for backend)

### Configuration
Create a `.env` file in the `backend` directory:
- GROQ_API_KEY
- GOOGLE_API_KEY
- ELEVENLABS_API_KEY
- ELEVENLABS_API_KEY_FALLBACK 

### Execution
Start the services (Frontend, Backend, PostgreSQL, Redis, Celery):
```bash
docker-compose up -d --build
```
The frontend is accessible at port 3000, and the backend REST API at port 8000.

---

This project aims to demonstrate production-ready AI engineering, focusing on fault tolerance, asynchronous processing, and edge-case handling in LLM interactions.
