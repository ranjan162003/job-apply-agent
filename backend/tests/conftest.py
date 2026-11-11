"""Shared fixtures: an in-memory database, a temp resume folder and a scripted fake LLM."""
from __future__ import annotations

import json
from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.agents.providers.base_llm_provider import BaseLlmProvider
from app.core.app_settings import get_settings
from app.db.database_session import OrmBase, get_db_session
from app.main import create_app
from app.schemas.provider_schemas import AuthMethod, ProviderId, ProviderStatus
from app.security.client_header_guard import CLIENT_HEADER
from app.vault import resume_importer


class ScriptedProvider(BaseLlmProvider):
    """Replies with queued strings in order and records every prompt it was sent."""

    provider_id = ProviderId.OLLAMA
    display_name = "Scripted"

    def __init__(self) -> None:
        self.replies: list[str] = []
        self.prompts: list[str] = []

    def queue(self, *payloads: dict | str) -> None:
        self.replies.extend(p if isinstance(p, str) else json.dumps(p) for p in payloads)

    def get_status(self) -> ProviderStatus:
        return ProviderStatus(
            provider_id=self.provider_id, display_name=self.display_name, description="", supports_cli_login=False,
            supports_api_key=False, is_ready=True, active_auth_method=AuthMethod.LOCAL_SERVER,
            default_model="scripted", status_message="ok",
        )

    def generate_text(self, prompt: str, model_name: str | None = None, json_schema: dict | None = None) -> str:
        self.prompts.append(prompt)
        if not self.replies:
            raise AssertionError("ScriptedProvider ran out of replies")
        return self.replies.pop(0)


@pytest.fixture
def provider(monkeypatch) -> ScriptedProvider:
    scripted = ScriptedProvider()
    monkeypatch.setattr(resume_importer, "get_llm_provider", lambda _: scripted)
    return scripted


@pytest.fixture(autouse=True)
def resume_folder(tmp_path, monkeypatch):
    monkeypatch.setattr(get_settings(), "resume_storage_dir", tmp_path / "resumes")
    return tmp_path / "resumes"


@pytest.fixture
def client() -> Iterator[TestClient]:
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    OrmBase.metadata.create_all(engine)
    session_factory = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

    def override_session():
        session = session_factory()
        try:
            yield session
        finally:
            session.close()

    app = create_app()
    app.dependency_overrides[get_db_session] = override_session
    with TestClient(app, headers={CLIENT_HEADER: "tests"}) as test_client:
        yield test_client
