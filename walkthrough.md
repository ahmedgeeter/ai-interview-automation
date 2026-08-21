# AutoHire Enterprise Refactoring - Phase 6 & 7 Walkthrough

We have successfully implemented two major architectural updates to the AutoHire engine:

## 1. Dynamic Role-Specific Rubric via Web Search (Phase 6)
We introduced an asynchronous, non-blocking capability for the Live Interviewer to conduct real-time web research before the interview begins.

- **`research_service.py`**: A new service encapsulating `DuckDuckGoSearchRun`. It fetches the absolute latest technical questions and expected answers for the requested role and uses Groq (Llama-3.3-70b) to compile them into a highly technical rubric.
- **LangGraph Integration**: We added a `research_role_node` that executes as the very first step in the `START` sequence. It saves the rubric to the `interview_context` in the state.
- **System Prompt Injection**: The `interviewer_node` was updated to dynamically read the `interview_context` and use it as its strict evaluation guide, vastly increasing the quality of the technical questions.

> [!NOTE]
> This search executes *before* the websocket streaming loop starts, guaranteeing that our sub-500ms Time-to-First-Byte (TTFB) voice latency remains completely unaffected during the actual conversation.

## 2. Next.js App Router Refactoring (Phase 7)
The monolithic `page.tsx` was dismantled into a clean, modern Next.js App Router structure, making it behave like a true production web application.

- **`/` (Landing Page)**: `frontend/app/page.tsx` now serves exclusively as the setup wizard. Upon completion, it initiates the session and routes the user.
- **`/interview/[sessionId]`**: The active interview room. It extracts the session ID from the URL and connects to the WebSockets. If the user accidentally refreshes, they can immediately rejoin their session!
- **`/scorecard/[sessionId]`**: The final evaluation view. We added a new `GET /api/evaluation/{session_id}` endpoint in the FastAPI backend, allowing this page to independently fetch the scorecard directly from the Postgres database.

> [!TIP]
> The URL routing allows candidates to bookmark their scorecard link and view it at any time in the future.

### Verification Results
- All React components type-checked and compiled flawlessly via `npm run build`.
- Docker containers have been completely rebuilt and are running the new graph logic and API endpoints.

You can now navigate to `http://localhost:3000` to test the new dynamic search capabilities and multi-page routing!
