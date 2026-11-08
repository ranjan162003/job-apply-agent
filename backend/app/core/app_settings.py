"""Central, typed application settings.

Every value can be overridden with an environment variable prefixed
`APPLY_COPILOT_` (e.g. `APPLY_COPILOT_OLLAMA_DEFAULT_MODEL=qwen2.5`) or via a
`backend/.env` file — see `.env.example`.
"""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_ROOT_DIR = Path(__file__).resolve().parents[2]
LOCAL_DATA_DIR = BACKEND_ROOT_DIR / "data"
APP_VERSION = "0.1.0"


class AppSettings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=BACKEND_ROOT_DIR / ".env",
        env_prefix="APPLY_COPILOT_",
        extra="ignore",
    )

    app_name: str = "Apply Copilot API"
    database_url: str = f"sqlite:///{(LOCAL_DATA_DIR / 'apply_copilot.db').as_posix()}"
    resume_storage_dir: Path = LOCAL_DATA_DIR / "resumes"
    max_resume_bytes: int = 5 * 1024 * 1024
    cors_allowed_origins: list[str] = ["http://localhost:5174", "http://127.0.0.1:5174"]
    # The API only answers to these Host headers, so a web page can't reach it through DNS rebinding.
    allowed_hosts: list[str] = ["localhost", "127.0.0.1", "testserver"]

    # --- Agents ---
    llm_timeout_seconds: int = 240
    ollama_timeout_seconds: int = 600

    # --- LLM providers ---
    claude_default_model: str = "claude-opus-5-5"
    gemini_default_model: str = "gemini-2.5-flash"
    ollama_base_url: str = "http://localhost:11434"
    ollama_default_model: str = "llama3.1"


@lru_cache
def get_settings() -> AppSettings:
    return AppSettings()
