import os
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# Base URL from environment
RAW_URL = os.getenv("POSTGRES_URL", "").strip()

# Normalize URL for asyncpg
def get_async_url(url: str) -> str:
    if url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql+asyncpg://", 1)
    elif url.startswith("postgresql://"):
        url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
    elif not url.startswith("postgresql+asyncpg://"):
        url = "postgresql+asyncpg://" + url.split("://", 1)[-1]
    
    # Strip incompatible sslmode from query string if present for asyncpg
    if "?" in url:
        base, query = url.split("?", 1)
        params = [p for p in query.split("&") if not p.startswith("sslmode=") and not p.startswith("ssl=")]
        url = base + ("?" + "&".join(params) if params else "")
    return url

# Normalize URL for synchronous psycopg2 (used by Celery worker)
def get_sync_url(url: str) -> str:
    if "postgresql+asyncpg://" in url:
        url = url.replace("postgresql+asyncpg://", "postgresql://", 1)
    elif url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql://", 1)
    return url

# Auto-detect SQLite fallback if running locally or in tests
if RAW_URL and "sqlite" in RAW_URL:
    if "sqlite+aiosqlite://" in RAW_URL:
        ASYNC_POSTGRES_URL = RAW_URL
        SYNC_POSTGRES_URL = RAW_URL.replace("sqlite+aiosqlite://", "sqlite://")
    else:
        ASYNC_POSTGRES_URL = RAW_URL.replace("sqlite://", "sqlite+aiosqlite://")
        SYNC_POSTGRES_URL = RAW_URL
elif not RAW_URL or os.getenv("USE_SQLITE", "").lower() in ("true", "1") or "@postgres:5432" in RAW_URL:
    ASYNC_POSTGRES_URL = "sqlite+aiosqlite:///./autohire.db"
    SYNC_POSTGRES_URL = "sqlite:///./autohire.db"
else:
    ASYNC_POSTGRES_URL = get_async_url(RAW_URL)
    SYNC_POSTGRES_URL = get_sync_url(RAW_URL)

connect_args = {}
if "postgresql+asyncpg://" in ASYNC_POSTGRES_URL:
    connect_args["timeout"] = 5.0
    if not any(h in ASYNC_POSTGRES_URL for h in ["localhost", "127.0.0.1", "postgres:5432"]):
        connect_args["ssl"] = True

engine = create_async_engine(
    ASYNC_POSTGRES_URL,
    echo=False,
    future=True,
    pool_pre_ping=True,
    connect_args=connect_args
)

async_session_maker = sessionmaker(
    engine, class_=AsyncSession, expire_on_commit=False
)

# Synchronous engine for Celery background tasks or thread executor
try:
    sync_engine = create_engine(
        SYNC_POSTGRES_URL,
        echo=False,
        pool_pre_ping=True
    )
    sync_session_maker = sessionmaker(
        sync_engine, expire_on_commit=False
    )
except Exception:
    sync_engine = None
    sync_session_maker = None

def fallback_to_sqlite():
    """Dynamically swap engine and session makers to local SQLite if PostgreSQL fails."""
    global engine, async_session_maker, sync_engine, sync_session_maker, ASYNC_POSTGRES_URL, SYNC_POSTGRES_URL
    ASYNC_POSTGRES_URL = "sqlite+aiosqlite:///./autohire.db"
    SYNC_POSTGRES_URL = "sqlite:///./autohire.db"
    engine = create_async_engine(
        ASYNC_POSTGRES_URL,
        echo=False,
        future=True,
        pool_pre_ping=True
    )
    async_session_maker = sessionmaker(
        engine, class_=AsyncSession, expire_on_commit=False
    )
    try:
        sync_engine = create_engine(
            SYNC_POSTGRES_URL,
            echo=False,
            pool_pre_ping=True
        )
        sync_session_maker = sessionmaker(
            sync_engine, expire_on_commit=False
        )
    except Exception:
        sync_engine = None
        sync_session_maker = None

async def get_db():
    global engine, async_session_maker
    try:
        async with async_session_maker() as session:
            yield session
    except Exception as e:
        print(f"[Database Error] Primary DB session failed: {e}. Activating SQLite fallback.")
        fallback_to_sqlite()
        async with async_session_maker() as session:
            yield session
