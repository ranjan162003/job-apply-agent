"""Store LLM API keys in the OS credential vault, never in plain files.

`keyring` maps to Windows Credential Manager, macOS Keychain, or the Secret
Service on Linux — all encrypted at rest and scoped to the current OS user.
Keys are only ever read back to call the provider they belong to, and are
never returned by the API.
"""
from __future__ import annotations

import keyring
from keyring.errors import KeyringError, PasswordDeleteError

from app.core.app_exceptions import ApiKeyStorageError
from app.schemas.provider_schemas import ProviderId

KEYRING_SERVICE_NAME = "job-apply-agent"


def _username_for(provider_id: ProviderId) -> str:
    return f"{provider_id.value}-api-key"


def save_api_key(provider_id: ProviderId, api_key: str) -> None:
    try:
        keyring.set_password(KEYRING_SERVICE_NAME, _username_for(provider_id), api_key.strip())
    except KeyringError as exc:
        raise ApiKeyStorageError(f"Couldn't save the API key to the OS credential vault: {exc}") from exc


def get_api_key(provider_id: ProviderId) -> str | None:
    try:
        return keyring.get_password(KEYRING_SERVICE_NAME, _username_for(provider_id))
    except KeyringError:
        return None


def delete_api_key(provider_id: ProviderId) -> None:
    try:
        keyring.delete_password(KEYRING_SERVICE_NAME, _username_for(provider_id))
    except PasswordDeleteError:
        pass  # nothing stored — already in the desired state
    except KeyringError as exc:
        raise ApiKeyStorageError(f"Couldn't remove the API key from the OS credential vault: {exc}") from exc
