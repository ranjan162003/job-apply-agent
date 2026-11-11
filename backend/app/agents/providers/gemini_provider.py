"""Gemini via either Google's `gemini` CLI login or a Gemini API key.

* CLI login (primary): running `gemini` the first time lets the user pick
  "Login with Google"; it opens a browser and caches OAuth credentials in
  `~/.gemini/`. Afterwards `gemini -p` runs on the account's free-tier quota.
* API key (fallback): a key from Google AI Studio, called over the public
  Generative Language REST API.
"""
from __future__ import annotations

from pathlib import Path

import httpx

from app.agents.providers.base_llm_provider import BaseLlmProvider
from app.agents.providers.cli_process_runner import (
    find_cli_executable,
    open_visible_login_terminal,
    run_cli_with_prompt_on_stdin,
)
from app.core.app_exceptions import ProviderCallError, ProviderNotConnectedError
from app.core.app_settings import get_settings
from app.schemas.provider_schemas import AuthMethod, LoginStartResponse, ProviderId, ProviderStatus
from app.security.api_key_vault import get_api_key

GEMINI_MODELS = ["gemini-2.5-flash", "gemini-2.5-pro"]
GEMINI_GENERATE_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
GEMINI_CLI_OAUTH_CREDS_FILE = Path.home() / ".gemini" / "oauth_creds.json"
# `gemini -p` appends stdin to this text, so the real prompt arrives via stdin.
GEMINI_CLI_PROMPT_SUFFIX = "Follow the instructions above and reply only as requested."


class GeminiProvider(BaseLlmProvider):
    provider_id = ProviderId.GEMINI
    display_name = "Gemini"

    def __init__(self) -> None:
        self._settings = get_settings()

    def get_status(self) -> ProviderStatus:
        cli_path = find_cli_executable("gemini")
        cli_logged_in = bool(cli_path) and GEMINI_CLI_OAUTH_CREDS_FILE.exists()
        api_key_saved = get_api_key(self.provider_id) is not None

        if api_key_saved:
            active, message = AuthMethod.API_KEY, "Connected with your Gemini API key."
        elif cli_logged_in:
            active, message = AuthMethod.CLI_LOGIN, "Connected through your Google account login."
        elif cli_path:
            active, message = None, "Gemini CLI is installed but not logged in."
        else:
            active, message = None, "Not connected."

        models = list(dict.fromkeys([self._settings.gemini_default_model, *GEMINI_MODELS]))
        return ProviderStatus(
            provider_id=self.provider_id,
            display_name=self.display_name,
            description="Google's Gemini — free-tier quota with a Google login, or an AI Studio API key.",
            supports_cli_login=True,
            supports_api_key=True,
            cli_installed=bool(cli_path),
            cli_logged_in=cli_logged_in,
            api_key_saved=api_key_saved,
            is_ready=active is not None,
            active_auth_method=active,
            available_models=models,
            default_model=self._settings.gemini_default_model,
            status_message=message,
            setup_hint=None if cli_path else "Install the Gemini CLI with `npm install -g @google/gemini-cli` to log in, or paste an API key.",
        )

    def start_browser_login(self) -> LoginStartResponse:
        cli_path = find_cli_executable("gemini")
        if not cli_path:
            return LoginStartResponse(
                started=False,
                message="The Gemini CLI isn't installed. Run `npm install -g @google/gemini-cli`, or paste an API key instead.",
            )
        if open_visible_login_terminal([cli_path], "Gemini login"):
            return LoginStartResponse(
                started=True,
                message="A terminal window opened — choose 'Login with Google', finish in your browser, "
                "close that window, then click 'Check status'.",
            )
        return LoginStartResponse(started=False, message="Run `gemini` in a terminal and choose 'Login with Google'.")

    def generate_text(self, prompt: str, model_name: str | None = None, json_schema: dict | None = None) -> str:
        model = model_name or self._settings.gemini_default_model
        api_key = get_api_key(self.provider_id)
        if api_key:
            return self._generate_with_api_key(api_key, prompt, model)

        cli_path = find_cli_executable("gemini")
        if cli_path and GEMINI_CLI_OAUTH_CREDS_FILE.exists():
            command = [cli_path, "-m", model, "-p", GEMINI_CLI_PROMPT_SUFFIX]
            return run_cli_with_prompt_on_stdin(command, prompt, self._settings.llm_timeout_seconds, self.display_name)

        raise ProviderNotConnectedError("Gemini isn't connected — log in with Google or save an API key.")

    def _generate_with_api_key(self, api_key: str, prompt: str, model: str) -> str:
        try:
            response = httpx.post(
                GEMINI_GENERATE_URL.format(model=model),
                headers={"x-goog-api-key": api_key},
                json={
                    "contents": [{"role": "user", "parts": [{"text": prompt}]}],
                    "generationConfig": {"responseMimeType": "application/json"},
                },
                timeout=self._settings.llm_timeout_seconds,
            )
        except httpx.TimeoutException as exc:
            raise ProviderCallError("Gemini took too long to respond.") from exc
        except httpx.HTTPError as exc:
            raise ProviderCallError("Couldn't reach the Gemini API — check your internet connection.") from exc

        if response.status_code in (401, 403):
            raise ProviderNotConnectedError("Google rejected the saved Gemini API key — check or replace it.")
        if response.status_code != 200:
            raise ProviderCallError(f"Gemini API error {response.status_code}: {response.text[:300]}")

        candidates = response.json().get("candidates") or []
        if not candidates:
            raise ProviderCallError("Gemini returned no answer (it may have been blocked by safety filters).")
        parts = candidates[0].get("content", {}).get("parts", [])
        return "".join(part.get("text", "") for part in parts)
