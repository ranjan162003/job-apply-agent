"""SQLAlchemy engine, session factory and FastAPI session dependency."""
from __future__ import annotations

from collections.abc import Iterator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.app_settings import LOCAL_DATA_DIR, get_settings


class OrmBase(DeclarativeBase):
    pass


_settings = get_settings()
engine = create_engine(
    _settings.database_url,
    # SQLite connections are used from FastAPI's worker threads.
    connect_args={"check_same_thread": False} if _settings.database_url.startswith("sqlite") else {},
)
SessionFactory = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def init_database() -> None:
    from app.db import orm_models  # noqa: F401  (registers tables on OrmBase)

    LOCAL_DATA_DIR.mkdir(parents=True, exist_ok=True)
    OrmBase.metadata.create_all(engine)


def get_db_session() -> Iterator[Session]:
    session = SessionFactory()
    try:
        yield session
    finally:
        session.close()
