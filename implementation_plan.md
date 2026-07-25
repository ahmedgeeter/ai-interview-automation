# AutoHire Enterprise Refactoring Plan

This plan details the architectural refactoring of the AutoHire platform to an enterprise-grade AI recruiting engine, fulfilling the requirements for high concurrency, ultra-low latency, event-driven decoupling, and rigorous observability.

## User Review Required

> [!IMPORTANT]
> - **Aegra Runtime**: We will integrate Aegra as the LangGraph runtime. Please ensure Aegra and PostgreSQL are available or can be set up via Docker Compose.
> - **Message Broker**: I propose using **Redis** for the message broker (Pub/Sub and background queues via Celery or RQ) due to its simplicity and high performance, rather than Kafka, unless you have a strict requirement for Kafka.
> - **TTS Engine**: The plan mentions streaming to a "fast TTS engine". I will design the interface for this, but please specify which TTS service you intend to use (e.g., ElevenLabs, Deepgram, OpenAI) so I can implement the correct async client.

## Open Questions

> [!WARNING]
> 1. **TTS Service**: Which TTS service should be used for the ultra-low latency voice pipeline?
> 2. **Message Broker**: Is Redis acceptable for the background task queue and pub/sub, or do you prefer RabbitMQ/Kafka?
> 3. **Observability Keys**: Do you have the necessary API keys for LangSmith and Langfuse ready to be added to the `.env` file?

## Proposed Changes

---

### Phase 1: Infrastructure & Database (PostgreSQL & Redis)

#### [MODIFY] [docker-compose.yml](file:///c:/Users/ahmed/Desktop/ai-interview-automation-main/ai-interview-automation-main/docker-compose.yml)
- Add PostgreSQL service for state persistence and token tracking.
- Add Redis service for the message broker and background queues.
- Ensure Aegra can connect to Postgres.

#### [NEW] [backend/app/db/](file:///c:/Users/ahmed/Desktop/ai-interview-automation-main/ai-interview-automation-main/backend/app/db)
- Set up SQLAlchemy/SQLModel for database connections and models.
- Create models for `Session`, `TokenUsage`, and `Evaluation`.

---

### Phase 2: Agent Runtime & State Persistence (Aegra)

#### [MODIFY] [backend/requirements.txt](file:///c:/Users/ahmed/Desktop/ai-interview-automation-main/ai-interview-automation-main/backend/requirements.txt)
- Add necessary dependencies: `redis`, `sqlalchemy`, `asyncpg`, `celery` (or `rq`), `langfuse`.

#### [MODIFY] [backend/app/graph/workflow.py](file:///c:/Users/ahmed/Desktop/ai-interview-automation-main/ai-interview-automation-main/backend/app/graph/workflow.py)
- Refactor the LangGraph to utilize Aegra for state management.
- Remove in-memory session dictionaries.
- Ensure the state graph uses persistent Postgres checkpointer via Aegra `Thread ID`.

#### [MODIFY] [backend/app/main.py](file:///c:/Users/ahmed/Desktop/ai-interview-automation-main/ai-interview-automation-main/backend/app/main.py)
- Update endpoints to use Aegra Thread IDs for session resumption.

---

### Phase 3: Ultra-Low Latency Voice & WebSocket Pipeline

#### [MODIFY] [backend/app/main.py](file:///c:/Users/ahmed/Desktop/ai-interview-automation-main/ai-interview-automation-main/backend/app/main.py)
- Optimize the WebSocket endpoint (`ws://...`) for streaming.
- Implement robust disconnect/reconnect logic using the Aegra Thread ID to resume state.

#### [NEW] [backend/app/services/tts_service.py](file:///c:/Users/ahmed/Desktop/ai-interview-automation-main/ai-interview-automation-main/backend/app/services/tts_service.py)
- Implement asynchronous chunking logic.
- As the LLM streams tokens, buffer them into coherent chunks (e.g., sentences) and send them to the TTS engine, then stream the resulting audio directly to the frontend via WebSockets.

---

### Phase 4: Event-Driven Evaluation Engine (Decoupling)

#### [NEW] [backend/app/workers/](file:///c:/Users/ahmed/Desktop/ai-interview-automation-main/ai-interview-automation-main/backend/app/workers)
- Set up a background worker (e.g., using Celery or a custom asyncio worker listening to Redis).
- Implement the "Assessor Agent" logic here.

#### [MODIFY] [backend/app/graph/nodes.py](file:///c:/Users/ahmed/Desktop/ai-interview-automation-main/ai-interview-automation-main/backend/app/graph/nodes.py)
- The "Live Interviewer" agent will now only handle the chat.
- At the end of the interview, instead of running the evaluator synchronously, it will publish an event to the Redis queue.

#### [NEW] [backend/app/workers/assessor.py](file:///c:/Users/ahmed/Desktop/ai-interview-automation-main/ai-interview-automation-main/backend/app/workers/assessor.py)
- Consumes the "interview_completed" event.
- Retrieves the transcript from Aegra/Postgres.
- Runs the Assessor Agent to generate the scorecard and saves it to the database.

---

### Phase 5: Observability, FinOps & Token Tracking

#### [MODIFY] [backend/app/graph/workflow.py](file:///c:/Users/ahmed/Desktop/ai-interview-automation-main/ai-interview-automation-main/backend/app/graph/workflow.py) & [backend/app/graph/nodes.py](file:///c:/Users/ahmed/Desktop/ai-interview-automation-main/ai-interview-automation-main/backend/app/graph/nodes.py)
- Natively integrate `LangSmith` (via standard env vars).
- Integrate `LangfuseCallbackHandler` for deep telemetry.
- Extract `prompt_tokens`, `completion_tokens`, and `latency` from the LLM responses.

#### [MODIFY] [backend/app/main.py](file:///c:/Users/ahmed/Desktop/ai-interview-automation-main/ai-interview-automation-main/backend/app/main.py)
- Modify the WebSocket loop to send a telemetry payload at the end of every agent turn: `{"type": "telemetry", "prompt_tokens": x, "completion_tokens": y, "latency_ms": z}`.
- Accumulate these metrics and save them to the `TokenUsage` Postgres table upon session completion.

#### [MODIFY] [frontend/components/TerminalChat.tsx](file:///c:/Users/ahmed/Desktop/ai-interview-automation-main/ai-interview-automation-main/frontend/components/TerminalChat.tsx)
- Implement the frontend listener for the `telemetry` WebSocket event to display a live "System Inspector / Cost Tracker" panel.

---

### Phase 6: Dynamic Role-Specific Rubric via Web Search

#### [MODIFY] [backend/app/graph/state.py](file:///c:/Users/ahmed/Desktop/ai-interview-automation-main/ai-interview-automation-main/backend/app/graph/state.py)
- Add `interview_context: str | None` and `is_research_done: bool` to `InterviewState`.

#### [NEW] [backend/app/services/research_service.py](file:///c:/Users/ahmed/Desktop/ai-interview-automation-main/ai-interview-automation-main/backend/app/services/research_service.py)
- Encapsulate the `DuckDuckGoSearchRun` tool.
- Create `async def fetch_interview_rubric(job_title: str)` that queries DuckDuckGo for top technical interview questions and uses the LLM to compile them into a strict rubric.

#### [MODIFY] [backend/app/graph/nodes.py](file:///c:/Users/ahmed/Desktop/ai-interview-automation-main/ai-interview-automation-main/backend/app/graph/nodes.py)
- Implement `research_role_node` which asynchronously calls the `research_service` and populates the `interview_context` in the state.
- Update `interviewer_node` system prompt to inject the `interview_context` dynamically.

#### [MODIFY] [backend/app/graph/workflow.py](file:///c:/Users/ahmed/Desktop/ai-interview-automation-main/ai-interview-automation-main/backend/app/graph/workflow.py)
- Wire `research_role_node` to execute before the `guardrail_node` when the session starts.

---

### Phase 7: Frontend Next.js Routing Refactor

The frontend currently uses a single `page.tsx` file holding all states (Setup -> Booting -> Interview -> Scorecard). We will refactor this to use the Next.js App Router properly for distinct URLs.

#### [MODIFY] [frontend/app/page.tsx](file:///c:/Users/ahmed/Desktop/ai-interview-automation-main/ai-interview-automation-main/frontend/app/page.tsx)
- Acts exclusively as the **Landing & Setup Wizard**.
- Upon finishing setup, it calls the backend to create a session, then uses `next/navigation` to `router.push(f'/interview/{session_id}')`.

#### [NEW] [frontend/app/interview/[sessionId]/page.tsx](file:///c:/Users/ahmed/Desktop/ai-interview-automation-main/ai-interview-automation-main/frontend/app/interview/[sessionId]/page.tsx)
- The **Active Interview Room**.
- Extracts the `sessionId` from the URL parameters.
- Connects directly to the WebSocket using that ID.
- Upon receiving the `evaluation_complete` payload, it uses `router.push(f'/scorecard/{session_id}')`.

#### [NEW] [frontend/app/scorecard/[sessionId]/page.tsx](file:///c:/Users/ahmed/Desktop/ai-interview-automation-main/ai-interview-automation-main/frontend/app/scorecard/[sessionId]/page.tsx)
- The **Final Evaluation View**.
- Loads the `FinalScorecard` component using the payload data.

#### [MODIFY] [backend/app/main.py](file:///c:/Users/ahmed/Desktop/ai-interview-automation-main/ai-interview-automation-main/backend/app/main.py)
- Add a new REST endpoint `GET /api/evaluation/{session_id}` to allow the Scorecard page to fetch the completed evaluation JSON from Postgres if the user refreshes the page directly.

## Verification Plan

### Automated Tests
- Test database connectivity (Postgres, Redis).
- Test WebSocket reconnection logic using mock Thread IDs.
- Test background worker event ingestion and processing.

### Manual Verification
- Start all services via `docker-compose`.
- Initiate an interview session from the frontend.
- Disconnect the WebSocket mid-interview and reconnect to verify state resumption via Aegra.
- Observe the Live System Inspector for token and latency telemetry.
- Complete the interview and verify the Assessor Agent runs in the background and populates the database with the final scorecard and FinOps data.
