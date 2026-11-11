"""A local Ollama server — free, fully offline, no login.

Requires Ollama installed and running (https://ollama.com) with at least one
model pulled, e.g. `ollama pull llama3.1`.
"""
from __future__ import annotations

import httpx

from app.agents.providers.base_llm_provider import BaseLlmProvider
from app.core.app_exceptions import ProviderCallError, ProviderNotConnectedError
from app.core.app_settings import get_settings
from app.schemas.provider_schemas import AuthMethod, ProviderId, ProviderStatus

STATUS_TIMEOUT_SECONDS = 3
# Lessons are up to ~700 words plus a reference answer and key points, all inside one JSON reply.
OLLAMA_MAX_OUTPUT_TOKENS = 3000
OLLAMA_CONTEXT_TOKENS = 8192  # prompt + reply must fit; Ollama's default window would truncate them


class OllamaProvider(BaseLlmProvider):
    provider_id = ProviderId.OLLAMA
    display_name = "Ollama (local)"

    def __init__(self) -> None:
        self._settings = get_settings()

    def _list_installed_models(self) -> list[str] | None:
        """Model names pulled locally, or None if the server isn't reachable."""
        try:
            response = httpx.get(f"{self._settings.ollama_base_url}/api/tags", timeout=STATUS_TIMEOUT_SECONDS)
            response.raise_for_status()
        except httpx.HTTPError:
            return None
        return [model["name"] for model in response.json().get("models", [])]

    def get_status(self) -> ProviderStatus:
        models = self._list_installed_models()
        running = models is not None
        has_models = bool(models)

        if not running:
            message = f"Ollama isn't running at {self._settings.ollama_base_url}."
        elif not has_models:
            message = "Ollama is running but has no models — pull one first."
        else:
            message = f"Ollama is running with {len(models)} model(s)."

        default_model = self._settings.ollama_default_model
        if has_models and not any(m.split(":")[0] == default_model.split(":")[0] for m in models):
            default_model = models[0]

        return ProviderStatus(
            provider_id=self.provider_id,
            display_name=self.display_name,
            description="Runs a free open model on your own machine — private and offline, but less capable.",
            supports_cli_login=False,
            supports_api_key=False,
            local_server_running=running,
            is_ready=running and has_models,
            active_auth_method=AuthMethod.LOCAL_SERVER if running else None,
            available_models=models or [],
            default_model=default_model,
            status_message=message,
            setup_hint=None if has_models else f"Install Ollama from https://ollama.com, then run `ollama pull {self._settings.ollama_default_model}`.",
        )

    def generate_text(self, prompt: str, model_name: str | None = None, json_schema: dict | None = None) -> str:
        model = model_name or self.get_status().default_model
        try:
            response = httpx.post(
                f"{self._settings.ollama_base_url}/api/generate",
                json={
                    "model": model,
                    "prompt": prompt,
                    "stream": False,
                    # Schema-constrained decoding: the reply *must* match the caller's contract.
                    # (Plain `"format": "json"` lets small models loop on whitespace.)
                    "format": json_schema or "json",
                    "options": {
                        "temperature": 0.2,
                        "num_predict": OLLAMA_MAX_OUTPUT_TOKENS,
                        "num_ctx": OLLAMA_CONTEXT_TOKENS,
                    },
                },
                timeout=self._settings.ollama_timeout_seconds,
            )
        except httpx.ConnectError as exc:
            raise ProviderNotConnectedError(
                f"Couldn't reach Ollama at {self._settings.ollama_base_url} — is it installed and running?"
            ) from exc
        except httpx.TimeoutException as exc:
            raise ProviderCallError(
                f"Ollama took longer than {self._settings.ollama_timeout_seconds}s. Local models on CPU are slow — "
                "try a smaller model (e.g. `ollama pull llama3.2:3b`) or use Claude/Gemini."
            ) from exc

        if response.status_code != 200:
            detail = response.text
            if "not found" in detail.lower():
                detail += f" — run `ollama pull {model}` first."
            raise ProviderCallError(f"Ollama request failed: {detail[:300]}")
        return response.json().get("response", "")
