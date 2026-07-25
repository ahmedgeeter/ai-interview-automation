import os
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

# Get Postgres URL from environment
POSTGRES_URL = os.getenv("POSTGRES_URL", "postgresql+asyncpg://aegra:aegra@localhost:5432/aegra")

engine = create_async_engine(
    POSTGRES_URL,
    echo=False,
    future=True
)

async_session_maker = sessionmaker(
    engine, class_=AsyncSession, expire_on_commit=False
)

async def get_db():
    async with async_session_maker() as session:
        yield session
