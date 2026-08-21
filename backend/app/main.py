"""
Application Entry Point (main.py)
---------------------------------
This is the core FastAPI application setup.
It orchestrates the initialization of the application, handles the lifecycle events
(like establishing the database schema on startup), configures CORS for the frontend,
and registers the primary API routers for session management and real-time WebSocket communication.
"""
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
    """
    Manages the application lifecycle.
    During startup, it connects to the database via SQLAlchemy and ensures
    that all tables defined in our models are created. This ensures data consistency
    before the application begins serving requests.
    """
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        print("Database tables created successfully.")
    except Exception as e:
        print(f"Failed to create database tables: {e}")

    yield

app = FastAPI(title="AI Engineering Interviewer", lifespan=lifespan)

# Configure Cross-Origin Resource Sharing (CORS)
# This allows the Next.js frontend to communicate securely with this backend.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In production, restrict to frontend domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from fastapi.responses import JSONResponse
from starlette.requests import Request

@app.middleware("http")
async def maintenance_middleware(request: Request, call_next):
    return JSONResponse(
        status_code=503,
        content={"message": "System is currently under maintenance. Please try again later."}
    )

# Register application routers to logically separate API endpoints
app.include_router(session_ctrl.router, prefix="/api", tags=["Session"])
app.include_router(ws_ctrl.router, prefix="/ws", tags=["WebSocket"])
