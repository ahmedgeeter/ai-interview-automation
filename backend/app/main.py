import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.models import state
from app.models.database import engine
from app.models.models import Base
from app.controllers import session_ctrl, ws_ctrl

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Aegra logic has been removed since LangGraph runs natively
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
