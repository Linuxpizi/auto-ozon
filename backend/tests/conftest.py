"""Shared test fixtures for the whole backend.

Provides:
- test_app  — FastAPI TestClient bound to the app
- test_db   — isolated in-memory SQLite session
- override_get_db — dependency override fixture

Usage in a sub-package conftest.py:
    from tests.conftest import test_app, test_db  # noqa: F401
"""

from typing import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.db import Base, get_db
from app.main import app

# ---------------------------------------------------------------------------
# In-memory SQLite database for tests
# ---------------------------------------------------------------------------

TEST_DATABASE_URL = "sqlite:///./test.db"

engine = create_engine(
    TEST_DATABASE_URL,
    connect_args={"check_same_thread": False},
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(scope="function")
def test_db() -> Generator[Session, None, None]:
    """Provide an isolated DB session per test function."""
    Base.metadata.create_all(bind=engine)
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()
    Base.metadata.drop_all(bind=engine)


@pytest.fixture(scope="function")
def override_get_db(test_db: Session) -> Generator[None, None, None]:
    """Override FastAPI dependency so routes use the test DB."""
    app.dependency_overrides[get_db] = lambda: test_db
    try:
        yield
    finally:
        app.dependency_overrides.clear()


@pytest.fixture(scope="function")
def test_app(override_get_db: None) -> Generator[TestClient, None, None]:
    """FastAPI TestClient with overridden DB dependency."""
    with TestClient(app) as client:
        yield client
