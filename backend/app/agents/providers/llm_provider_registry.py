"""Look up a provider instance by id — the only place providers are wired in."""
from __future__ import annotations

from functools import lru_cache

from app.agents.providers.base_llm_provider import BaseLlmProvider
from app.agents.providers.claude_provider import ClaudeProvider
from app.agents.providers.gemini_provider import GeminiProvider
from app.agents.providers.ollama_provider import OllamaProvider
from app.schemas.provider_schemas import ProviderId


@lru_cache
def _all_providers() -> dict[ProviderId, BaseLlmProvider]:
    providers: list[BaseLlmProvider] = [ClaudeProvider(), GeminiProvider(), OllamaProvider()]
    return {provider.provider_id: provider for provider in providers}


def get_llm_provider(provider_id: ProviderId) -> BaseLlmProvider:
    return _all_providers()[provider_id]


def list_llm_providers() -> list[BaseLlmProvider]:
    return list(_all_providers().values())
