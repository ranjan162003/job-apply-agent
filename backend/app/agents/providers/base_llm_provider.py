"""The single interface every LLM provider implements.

Every agent only ever talks to `BaseLlmProvider`, so adding a new
model vendor means adding one file in this folder plus a registry entry.
"""
from __future__ import annotations

from abc import ABC, abstractmethod

from app.schemas.provider_schemas import LoginStartResponse, ProviderId, ProviderStatus


class BaseLlmProvider(ABC):
    provider_id: ProviderId
    display_name: str

    @abstractmethod
    def get_status(self) -> ProviderStatus:
        """Report what's installed / logged in / saved, and whether calls will work."""

    @abstractmethod
    def generate_text(self, prompt: str, model_name: str | None = None, json_schema: dict | None = None) -> str:
        """Send one prompt and return the raw text reply.

        `json_schema` describes the JSON object the caller expects back. Providers
        that support constrained output (Ollama) enforce it; others rely on the prompt.

        Raises `ProviderNotConnectedError` if nothing is configured, or
        `ProviderCallError` if the call itself fails.
        """

    def start_browser_login(self) -> LoginStartResponse:
        return LoginStartResponse(started=False, message=f"{self.display_name} doesn't use a browser login.")
