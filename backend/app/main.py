"""
Application Entry Point (main.py)
---------------------------------
This is the core FastAPI application setup.
It orchestrates the initialization of the application, handles the lifecycle events
(like establishing the database schema on startup), configures CORS for the frontend,
and registers the primary API routers for session management and real-time WebSocket communication.
"""
import os
import sys
from dotenv import load_dotenv

# Ensure .env is loaded immediately before any internal module imports
load_dotenv()
if not os.getenv("ELEVENLABS_API_KEY"):
    load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

import asyncio
import time
import httpx
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.models import state
from app.models.database import engine, fallback_to_sqlite
from app.models.models import Base
from app.controllers import session_ctrl, ws_ctrl
from fastapi.responses import JSONResponse

async def background_self_ping():
    """
    Active keep-alive pulse to prevent cloud platforms (Render, Railway, Fly.io, etc.)
    from putting the server container into cold sleep during idle periods.
    """
    await asyncio.sleep(15)  # Wait for server startup
    ping_url = os.getenv("KEEP_ALIVE_URL") or os.getenv("RENDER_EXTERNAL_URL")
    if not ping_url:
        port = os.getenv("PORT", "8000")
        ping_url = f"http://127.0.0.1:{port}/ping"
    elif not ping_url.endswith("/ping") and not ping_url.endswith("/health"):
        ping_url = ping_url.rstrip("/") + "/ping"
        
    print(f"[KeepAlive] Active keep-alive daemon started targeting: {ping_url}")
    while True:
        try:
            # Ping every 7 minutes (420 seconds) - safely below the 10-15m cloud sleep threshold
            await asyncio.sleep(420)
            async with httpx.AsyncClient(timeout=10.0) as client:
                res = await client.get(ping_url)
                if res.status_code == 200:
                    print(f"[KeepAlive] Heartbeat pulse success: HTTP {res.status_code}")
        except asyncio.CancelledError:
            break
        except Exception:
            pass

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Manages the application lifecycle.
    During startup, it connects to the database via SQLAlchemy and ensures
    that all tables defined in our models are created. Also runs the active keep-alive daemon.
    """
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        print("Database tables created successfully.")
    except Exception as e:
        print(f"[DB Warning] Could not connect to primary database: {e}. Activating SQLite fallback immediately.")
        fallback_to_sqlite()
        try:
            from app.models.database import engine as sqlite_engine
            async with sqlite_engine.begin() as conn:
                await conn.run_sync(Base.metadata.create_all)
            print("SQLite fallback database initialized successfully.")
        except Exception as sqlite_err:
            print(f"[DB Fatal] SQLite fallback initialization failed: {sqlite_err}")

    ping_task = asyncio.create_task(background_self_ping())
    yield
    ping_task.cancel()

app = FastAPI(title="AI Engineering Interviewer", lifespan=lifespan)

@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    """Ensure any uncaught exception always returns CORS headers to prevent browser fetch blocks."""
    import traceback
    traceback.print_exc()
    response = JSONResponse(
        status_code=500,
        content={"detail": f"Internal Server Error: {str(exc)}"}
    )
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Methods"] = "*"
    response.headers["Access-Control-Allow-Headers"] = "*"
    return response

from app.middleware.rate_limiter import RateLimiterMiddleware

# Configure Cross-Origin Resource Sharing (CORS)
# Support configurable origins via ALLOWED_ORIGINS (comma-separated).
cors_env = os.getenv("ALLOWED_ORIGINS", "*").strip()
if cors_env and cors_env != "*":
    cors_origins = [o.strip() for o in cors_env.split(",") if o.strip()]
    cors_credentials = True
else:
    cors_origins = ["*"]
    cors_credentials = False

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=cors_credentials,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Apply Sliding-Window Rate Limiting & Token Abuse Protection
app.add_middleware(RateLimiterMiddleware)



# Register application routers to logically separate API endpoints
app.include_router(session_ctrl.router, prefix="/api", tags=["Session"])
app.include_router(ws_ctrl.router, prefix="/ws", tags=["WebSocket"])

@app.get("/health", tags=["Health"])
@app.head("/health", tags=["Health"])
@app.get("/api/health", tags=["Health"])
@app.head("/api/health", tags=["Health"])
async def root_health():
    """Root health check for load balancers, monitors and orchestrators."""
    return {"status": "ok", "service": "autohire-backend"}

@app.get("/ping", tags=["Health"])
@app.head("/ping", tags=["Health"])
@app.get("/api/ping", tags=["Health"])
@app.head("/api/ping", tags=["Health"])
async def ping():
    """Sub-millisecond keep-alive ping for external monitors and container warm state."""
    return {"status": "alive", "timestamp": time.time()}

@app.get("/", tags=["Info"])
async def root_info():
    """Service overview metadata."""
    return {
        "service": "AutoHire AI Interview Engine",
        "status": "online",
        "docs": "/docs",
        "endpoints": {
            "health": "/health",
            "start_session": "/api/start-session",
            "scorecard": "/api/scorecard/{session_id}",
            "websocket": "/ws/{session_id}"
        }
    }
