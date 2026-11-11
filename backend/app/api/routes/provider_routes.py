"""Model picker endpoints: list providers, browser login, save/remove API keys."""
from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor

from fastapi import APIRouter, status

from app.agents.providers.llm_provider_registry import get_llm_provider, list_llm_providers
from app.core.app_exceptions import InvalidRequestError
from app.schemas.provider_schemas import ApiKeySaveRequest, LoginStartResponse, ProviderId, ProviderStatus
from app.security.api_key_vault import delete_api_key, save_api_key

router = APIRouter(prefix="/providers", tags=["providers"])


@router.get("", response_model=list[ProviderStatus])
def list_provider_statuses() -> list[ProviderStatus]:
    # Each status check may shell out or hit the network, so run them side by side.
    providers = list_llm_providers()
    with ThreadPoolExecutor(max_workers=len(providers)) as pool:
        return list(pool.map(lambda provider: provider.get_status(), providers))


@router.get("/{provider_id}", response_model=ProviderStatus)
def read_provider_status(provider_id: ProviderId) -> ProviderStatus:
    return get_llm_provider(provider_id).get_status()


@router.post("/{provider_id}/login", response_model=LoginStartResponse)
def start_provider_login(provider_id: ProviderId) -> LoginStartResponse:
    return get_llm_provider(provider_id).start_browser_login()


@router.put("/{provider_id}/api-key", response_model=ProviderStatus)
def save_provider_api_key(provider_id: ProviderId, body: ApiKeySaveRequest) -> ProviderStatus:
    provider = get_llm_provider(provider_id)
    if not provider.get_status().supports_api_key:
        raise InvalidRequestError(f"{provider.display_name} doesn't use an API key.")
    save_api_key(provider_id, body.api_key)
    return provider.get_status()


@router.delete("/{provider_id}/api-key", status_code=status.HTTP_200_OK, response_model=ProviderStatus)
def remove_provider_api_key(provider_id: ProviderId) -> ProviderStatus:
    delete_api_key(provider_id)
    return get_llm_provider(provider_id).get_status()
