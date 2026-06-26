# AI Engineering Interviewer - Implementation Plan

This plan details the implementation of a SaaS-grade AI engineering interviewer application based on your comprehensive design. It features a FastAPI backend utilizing LangGraph and the Groq API for stateful, low-latency AI orchestration, and a Next.js frontend with a split-pane terminal and dynamic Recharts dashboard.

## User Review Required

> [!IMPORTANT]
> The backend relies on the Groq API for inference (using `llama3-70b-8192` or similar supported models). Please ensure you have a valid Groq API key available.

> [!NOTE]
> For the Next.js setup, we will use the App Router (`app/` directory), standard React setup, and Tailwind CSS.
> For the WebSocket communication, we will use standard `WebSocket` API on the frontend and FastAPI's native `WebSocket` endpoints on the backend.

## Open Questions

> [!WARNING]
> 1. **Groq API Key**: Are you ready to provide the Groq API key in the `.env` file once the backend scaffolding is ready?
> 2. **Mocking vs. Live Integration**: Would you like me to build the frontend and backend integration using mock responses first to get the UI right, or should we go straight into integrating the live Groq API?
> 3. **Design Colors**: You mentioned a dark IDE-like theme. Do you have a specific color palette in mind (e.g., VS Code default dark, Dracula, Monokai), or should I design a premium custom dark mode?

## Proposed Changes

---

### Phase 1: Infrastructure and Scaffolding Setup

#### [NEW] `backend/`
- Set up a FastAPI project using `uvicorn` and `websockets`.
- Define dependency management using `requirements.txt` (`fastapi`, `uvicorn`, `langgraph`, `langchain-groq`, `pydantic`).

#### [NEW] `frontend/`
- Initialize Next.js project with Tailwind CSS using `npx create-next-app`.
- Install `recharts`, `lucide-react` (for icons), and any necessary utilities (like `framer-motion` for micro-animations).

---

### Phase 2: AI Engineering & LangGraph Engine (Backend)

#### [NEW] `backend/app/graph/state.py`
- Define the `State` object (TypedDict/Pydantic) to hold: message history, targeted job title, current question count, and evaluation payload.

#### [NEW] `backend/app/graph/nodes.py`
- **Interviewer Node**: Uses a rigorous System Prompt and user history to output adaptive questions.
- **Guardrail Node**: Parallel/pre-processing node to validate input, prevent injection, and ensure the user answers technical questions.
- **Evaluator Node**: Triggered at the end to ingest transcripts and enforce Groq JSON output for scoring.

#### [NEW] `backend/app/graph/workflow.py`
- Assemble the nodes into a `StateGraph`, define edges and conditional routing (e.g., routing to the Evaluator when the max question count is reached).

---

### Phase 3: Backend Implementation (API and WebSockets)

#### [NEW] `backend/app/main.py`
- **WebSocket Endpoint (`ws://...`)**: Handles bidirectional streaming of user inputs and AI response chunks. Maps WebSocket payloads to the LangGraph session.
- **Session Management**: In-memory dictionary to isolate state across different concurrent WebSocket connections.
- **REST Endpoints**:
  - `POST /api/start-session`: Initializes the State Machine.
  - `GET /api/scorecard/{session_id}`: Retrieves final JSON evaluation payload.

---

### Phase 4: Frontend Implementation (The Differentiator)

#### [NEW] `frontend/app/page.tsx`
- Implement the Split-Pane layout (60% Left Pane / 40% Right Pane) as a Single Page Application (SPA).

#### [NEW] `frontend/components/TerminalChat.tsx`
- (Left Pane) A terminal-style IDE chat interface. Muted gray for system prompts, syntax highlighting for code inputs, and real-time chunk rendering typing indicators.

#### [NEW] `frontend/components/DynamicScorecard.tsx`
- (Right Pane) Recharts integration mapping core competencies (Code Quality, Architecture, Problem Solving). Will update progressively based on WebSocket messages.

#### [NEW] `frontend/components/FinalScorecard.tsx`
- The full viewport final evaluation state that unmounts the chat and shows the full JSON output and radar chart alongside export options.

## Verification Plan

### Automated Tests
- Basic endpoint checks for FastAPI initialization (`GET /health`).

### Manual Verification
- Start FastAPI backend and Next.js frontend locally.
- Initialize an interview session from the UI, observe the initial WebSocket connection and UI update.
- Respond to questions, observe dynamic updates in the Radar chart.
- Complete the interview, verify the transition to the Final Output State.
