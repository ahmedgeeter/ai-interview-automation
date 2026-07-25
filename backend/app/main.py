import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from langgraph_sdk import get_client

from app.models import state
from app.models.database import engine
from app.models.models import Base
from app.controllers import session_ctrl, ws_ctrl

@asynccontextmanager
async def lifespan(app: FastAPI):
    aegra_url = os.getenv("AEGRA_URL", "http://aegra:2026")
    try:
        state.client = get_client(url=aegra_url)
        assistants = await state.client.assistants.search(graph_id="agent")
        if assistants:
            state.assistant_id = assistants[0]["assistant_id"]
        else:
            assistant = await state.client.assistants.create(graph_id="agent")
            state.assistant_id = assistant["assistant_id"]
        print(f"Connected to Aegra at {aegra_url}. Assistant ID: {state.assistant_id}")
    except Exception as e:
        print(f"Failed to connect to Aegra at {aegra_url}: {e}")
        
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        print("Database tables created successfully.")
    except Exception as e:
        print(f"Failed to create database tables: {e}")

    yield

app = FastAPI(title="AI Engineering Interviewer", lifespan=lifespan)

# Allow CORS for Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In production, restrict to frontend domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(session_ctrl.router, prefix="/api", tags=["Session"])
app.include_router(ws_ctrl.router, prefix="/ws", tags=["WebSocket"])
