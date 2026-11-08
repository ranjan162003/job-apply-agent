"""LLM provider identity, connection status and auth payloads."""
from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, Field


class ProviderId(str, Enum):
    CLAUDE = "claude"
    GEMINI = "gemini"
    OLLAMA = "ollama"


class AuthMethod(str, Enum):
    CLI_LOGIN = "cli_login"
    API_KEY = "api_key"
    LOCAL_SERVER = "local_server"


class ProviderStatus(BaseModel):
    provider_id: ProviderId
    display_name: str
    description: str
    supports_cli_login: bool
    supports_api_key: bool
    cli_installed: bool = False
    cli_logged_in: bool = False
    api_key_saved: bool = False
    local_server_running: bool = False
    is_ready: bool
    active_auth_method: AuthMethod | None = None
    available_models: list[str] = []
    default_model: str
    status_message: str
    setup_hint: str | None = None


class ApiKeySaveRequest(BaseModel):
    api_key: str = Field(min_length=8, max_length=512)


class LoginStartResponse(BaseModel):
    started: bool
    message: str
