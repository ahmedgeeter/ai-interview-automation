# AutoHire: Advanced AI-Powered Technical Interview System

<div align="center">
  <img src="https://img.shields.io/badge/Status-Production_Ready-success?style=for-the-badge" alt="Status" />
  <img src="https://img.shields.io/badge/Architecture-Event_Driven-blue?style=for-the-badge" alt="Architecture" />
  <img src="https://img.shields.io/badge/Stack-Next.js_|_FastAPI_|_LangGraph-black?style=for-the-badge" alt="Stack" />
</div>

<br />

AutoHire is a state-of-the-art, bidirectional, real-time AI interview platform designed to conduct highly realistic technical, behavioral, and mixed interviews. By orchestrating multiple Large Language Models (LLMs) through agentic workflows and real-time WebSockets, AutoHire provides an enterprise-grade automated assessment solution that evaluates candidates precisely, handles complex edge cases, and scales efficiently.

---

## 1. System Architecture Overview

The platform is built on a highly decoupled, scalable, and event-driven microservices architecture. It separates the real-time interaction layer from the heavy computational evaluation layer to guarantee ultra-low latency during the interview process.

### Technology Stack
- **Frontend Layer:** Next.js 14, React, Tailwind CSS. Handles UI state, WebSocket connections, and native browser Speech-to-Text (STT) capabilities.
- **Backend API Layer:** FastAPI (Python) serving RESTful endpoints and high-concurrency WebSockets.
- **Agentic AI Layer:** LangChain and LangGraph (via Aegra Framework) for stateful, cyclic workflow orchestration.
- **LLM Engine:** 
  - Primary Model: Groq (Llama-3.3-70b-versatile) for ultra-fast, low-latency conversation.
  - Fallback Model: Google Gemini 2.5 Flash for robust, hallucination-free multilingual execution.
- **Asynchronous Processing:** Celery workers backed by Redis for decoupled, intensive background tasks.
- **Database:** PostgreSQL for persistent conversational state, session configurations, and token telemetry tracking.
- **Voice Synthesis Pipeline:** ElevenLabs API with custom Phonetic Middleware for authentic localized dialect pronunciation.

---

## 2. The Agentic AI Pipeline (LangGraph Orchestration)

Instead of relying on traditional, stateless request-response LLM calls, AutoHire employs **LangGraph** to manage a cyclic, stateful interview workflow. The entire interview is represented as a state machine.

### The State Definition (InterviewState)
The system maintains a strictly typed dictionary (`TypedDict`) containing the conversation history, job title, persona, telemetry data, language preference, cheat signals, and a dynamic rubric. 

### The Execution Nodes
1. **Guardrail Node:** The entry point for every user input. It checks the current state limits (e.g., maximum questions reached or time expired) and routes the execution either to the interviewer or the final evaluator.
2. **Interviewer Node:** The core conversational engine. It generates the next technical question or follow-up based on the conversation history, the candidate's CV, and the specific domain context. It heavily utilizes prompt engineering to dynamically adjust its tone based on the candidate's seniority (Junior vs. Senior).
3. **Evaluator Node:** A terminal node triggered only when the interview concludes. It performs a comprehensive JSON-based evaluation of the entire transcript.

### Streaming Execution
The backend invokes the LangGraph state machine using asynchronous streaming (`stream_mode="messages"`). As the LLM generates tokens, the backend intercepts them and streams them down to the frontend via WebSockets as text deltas. This creates a realistic "typing" effect on the frontend and drastically reduces perceived latency.

---

## 3. Bidirectional Real-Time Communication Pipeline

AutoHire relies on WebSockets for continuous, full-duplex communication between the client and the server. 

### Connection Lifecycle
- When a candidate joins a session, a WebSocket connection is established.
- The server fetches the initial session configuration from PostgreSQL (via Aegra checkpointers) and reconstructs the LangGraph state.
- If the connection drops due to network instability, the frontend automatically attempts exponential backoff reconnection. Because the state is persistently checkpointed on the backend, the interview resumes exactly where it left off without any data loss.

### Telemetry and Live Assessment
During the WebSocket session, the backend continuously streams telemetry data (prompt tokens, completion tokens, latency, and voice tokens). Simultaneously, a lightweight asynchronous function (`generate_live_scores`) evaluates the last three messages to update the frontend's Live Assessment progress bars (Technical, Problem Solving, Communication) without blocking the main conversational graph.

---

## 4. Voice and Speech Processing Pipeline

The voice pipeline is designed to achieve maximum realism with minimal latency, supporting multiple languages and specific regional dialects.

### Speech-to-Text (STT)
The frontend leverages the native browser Web Speech API for real-time transcription. This removes the need to send heavy audio blobs over the network, ensuring the backend receives clean text instantaneously as the candidate speaks.

### Text-to-Speech (TTS) Middleware
When the AI generates a text response, the backend triggers the ElevenLabs API to synthesize speech. The audio is streamed back to the client as Base64 encoded strings and played via the Web Audio API. 

To ensure continuous operation, the TTS pipeline implements a dynamic key rotation strategy. If the primary ElevenLabs API key throws an HTTP 401 (Unauthorized) or 429 (Too Many Requests) due to quota limits, the system instantly catches the exception and hot-swaps to a secondary fallback key, regenerating the audio with zero downtime.

---

## 5. Decoupled Evaluation & Background Workers

Evaluating a candidate thoroughly across multiple dimensions (Technical Depth, Architecture, Problem Solving, Integrity) requires analyzing the entire transcript. Doing this synchronously would block the WebSocket thread and cause massive delays at the end of the interview.

### The Celery Integration
AutoHire solves this by pushing the final evaluation to an asynchronous Celery worker (`evaluate_candidate.delay`). 
- When the interview concludes, the WebSocket informs the frontend that the scorecard is being generated asynchronously.
- The Celery worker picks up the task from the Redis broker, invokes the heavyweight LLM evaluation prompt, parses the resulting JSON, and saves it directly to PostgreSQL.
- The frontend redirects to a dedicated Scorecard Page, which continuously polls the backend API until the database confirms the evaluation payload is ready for presentation.

---

## 6. Anti-Cheat & Integrity Mechanisms

Maintaining the integrity of a remote automated interview is critical. AutoHire includes built-in behavioral monitoring.

### Tab-Switch Detection
The frontend monitors browser visibility states. If the candidate switches tabs or minimizes the window, a `tab_switch` signal is sent through the WebSocket.
The backend intercepts this signal and updates the `cheat_signals` counter in the LangGraph state. On the next AI generation cycle, the prompt is dynamically injected with a critical instruction: The AI will interrupt its normal flow, issue a professional warning about the loss of focus, and immediately ask a highly complex, unexpected technical question to verify if the candidate was looking up answers.

---

## 7. Engineering Challenges & Trade-Offs Solved

Building this system required navigating severe technical trade-offs. Below is a detailed breakdown of the challenges faced and the engineering solutions implemented.

### Trade-Off A: Multi-Language TTS vs. Dialect Accuracy (Egyptian Arabic)
* **The Problem:** Standard TTS engines struggle heavily with localized dialects like Egyptian Colloquial Arabic unless explicit phonetic diacritics are provided. However, instructing the LLM to output heavily diacritized text resulted in a cluttered, unreadable frontend chat UI.
* **The Solution:** I developed a decoupled Phonetic Middleware (`tts_service.py`). The LLM is strictly prompted to output clean, diacritic-free text for the UI. Before this text is sent to the ElevenLabs API, the backend passes it through an optimized Regex mapping dictionary that silently injects precise phonetic diacritics (e.g., converting regular words to their exact phonetic equivalents) exclusively for the audio payload.
* **Result:** Perfect regional pronunciation in the audio stream while maintaining a pristine frontend reading experience.

### Trade-Off B: Ultra-Low Latency vs. Accurate Evaluation
* **The Problem:** Running a 70B parameter model to evaluate the candidate's technical depth synchronously blocked the WebSocket thread, leading to 8 to 10 seconds of latency between questions.
* **The Solution:** I redesigned the architecture into a two-tier evaluation system. The primary LangGraph node handles pure conversation with minimal latency. The complex evaluation is deferred to a terminal node and a decoupled Celery worker for the final scorecard. The live progress bars use a highly restrictive, low-token rolling context window to provide instant visual feedback without blocking the main conversational loop.

### Trade-Off C: Strict Schema Validation vs. Dynamic Frontend Payloads
* **The Problem:** Passing dynamic frontend configurations (like time limits or modes) into LangGraph's initialization caused immediate HTTP 422 Unprocessable Entity crashes. LangGraph's strongly typed state schema strictly rejects unknown keys, which caused the WebSocket to enter an infinite offline/online reconnect loop.
* **The Solution:** I implemented a dynamic state sanitizer in the WebSocket controller. It intercepts the incoming payload, filters it against a strict whitelist that corresponds exactly to the LangGraph state schema, and safely drops extraneous configuration variables before invoking the graph, ensuring 100% stable connection lifecycles.

### Trade-Off D: LLM Hallucination in Multi-Lingual Contexts
* **The Problem:** When instructed to speak Arabic while discussing complex technical concepts (e.g., System Design, Load Balancing, Database Sharding), the Llama-3 model occasionally hallucinated Chinese characters or improperly translated technical jargon, ruining the professional context.
* **The Solution:** I implemented advanced Prompt Engineering boundaries, injecting a binding instruction that forces the model to retain English formatting strictly for technical jargon while restricting the conversational wrapper to Arabic. This was paired with a dual-LLM architecture: if the primary model fails or hallucinates, the system instantly routes the prompt to Google Gemini 2.5 Flash, which has superior cross-lingual stability, ensuring absolute data purity.

---

## 8. Deployment & Infrastructure Setup

The entire architecture is containerized using Docker, ensuring environment parity across development and production.

### Prerequisites
- Docker and Docker Compose
- Node.js 20+ (for local frontend development)
- Python 3.11+ (for local backend development)

### Environment Configuration
The system requires specific API keys to function. Create a `.env` file in the `backend` directory with the following configuration:
- GROQ_API_KEY
- GOOGLE_API_KEY
- ELEVENLABS_API_KEY
- ELEVENLABS_API_KEY_FALLBACK (Critical for zero-downtime voice synthesis)

### Execution
To start the entire microservices cluster (Next.js Frontend, FastAPI Backend, PostgreSQL, Redis, and Celery Workers):
```bash
docker-compose up -d --build
```
The frontend application will be accessible at port 3000, and the backend REST API (with Swagger documentation) will be exposed on port 8000.

---

This project was meticulously architected to demonstrate production-ready AI engineering. It focuses heavily on fault tolerance, asynchronous processing, and edge-case handling in LLM interactions, proving that generative AI can be managed in a deterministic, highly reliable manner at scale.
