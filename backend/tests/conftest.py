import os
import pytest
import asyncio
from app.models.models import Base
from app.models.database import engine, sync_engine

@pytest.fixture(scope="session", autouse=True)
def initialize_test_database():
    """
    Session-scoped autouse fixture that guarantees all SQLAlchemy tables
    are created before test execution in CI/local test runners.
    """
    if sync_engine is not None:
        Base.metadata.create_all(bind=sync_engine)
    else:
        async def _create_tables():
            async with engine.begin() as conn:
                await conn.run_sync(Base.metadata.create_all)
        asyncio.run(_create_tables())

    yield

    try:
        if sync_engine is not None:
            Base.metadata.drop_all(bind=sync_engine)
        else:
            async def _drop_tables():
                async with engine.begin() as conn:
                    await conn.run_sync(Base.metadata.drop_all)
            asyncio.run(_drop_tables())
    except Exception:
        pass
