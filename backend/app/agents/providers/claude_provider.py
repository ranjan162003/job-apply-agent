"""Claude via either the Claude Code CLI login or an Anthropic API key.

* CLI login (primary): `claude auth login` opens a browser against Claude.ai;
  afterwards `claude -p` runs off the account's subscription allowance --
  Anthropic's documented scripting pattern, no separate API billing.
* API key (fallback): the user pastes a key; calls go through the official
  `anthropic` SDK.

When both are configured the API key wins, since saving one is an explicit
choice the user made in this app.
"""
from __future__ import annotations

import json
import logging

import anthropic

from app.agents.providers.base_llm_provider import BaseLlmProvider
from app.agents.providers.cli_process_runner import (
    find_cli_executable,
    open_visible_login_terminal,
    run_cli_quietly,
    run_cli_with_prompt_on_stdin,
)
from app.core.app_exceptions import ProviderCallError, ProviderNotConnectedError
from app.core.app_settings import get_settings
from app.schemas.provider_schemas import AuthMethod, LoginStartResponse, ProviderId, ProviderStatus
from app.security.api_key_vault import get_api_key

logger = logging.getLogger(__name__)

CLAUDE_MODELS = ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-4-5"]
# Server-side refusal fallback ("default" routing) is accepted on these models only.
MODELS_SUPPORTING_DEFAULT_FALLBACK = {"claude-opus-5-5", "claude-sonnet-5-5"}
API_MAX_OUTPUT_TOKENS = 16000
CLI_MODEL_FAMILY_ALIASES = ("opus", "sonnet", "haiku")
_last_known_cli_login = False


def cli_model_alias(model: str) -> str:
    """Map a full model id to the CLI's family alias (`claude-opus-5-5` -> `opus`).

    Older Claude Code builds reject model ids newer than their built-in catalog,
    but always accept the family aliases, which resolve to the newest model they know.
    """
    return next((alias for alias in CLI_MODEL_FAMILY_ALIASES if alias in model), model)


class ClaudeProvider(BaseLlmProvider):
    provider_id = ProviderId.CLAUDE
    display_name = "Claude"

    def __init__(self) -> None:
        self._settings = get_settings()

    # ---------- status ----------

    def get_status(self) -> ProviderStatus:
        cli_path = find_cli_executable("claude")
        cli_logged_in = bool(cli_path) and self._is_cli_logged_in(cli_path)
        api_key_saved = get_api_key(self.provider_id) is not None

        if api_key_saved:
            active, message = AuthMethod.API_KEY, "Connected with your Anthropic API key."
        elif cli_logged_in:
            active, message = AuthMethod.CLI_LOGIN, "Connected through your Claude account login."
        elif cli_path:
            active, message = None, "Claude Code is installed but not logged in."
        else:
            active, message = None, "Not connected."

        return ProviderStatus(
            provider_id=self.provider_id,
            display_name=self.display_name,
            description="Anthropic's Claude — strongest reasoning; uses your Claude.ai plan or an API key.",
            supports_cli_login=True,
            supports_api_key=True,
            cli_installed=bool(cli_path),
            cli_logged_in=cli_logged_in,
            api_key_saved=api_key_saved,
            is_ready=active is not None,
            active_auth_method=active,
            available_models=CLAUDE_MODELS,
            default_model=self._settings.claude_default_model,
            status_message=message,
            setup_hint=None if cli_path else "Install Claude Code (https://claude.com/claude-code) to log in, or paste an API key.",
        )

    @staticmethod
    def _is_cli_logged_in(cli_path: str) -> bool:
        """Ask `claude auth status`; if it can't answer (slow/busy machine), reuse the last answer.

        A timeout means "unknown", not "logged out" — treating it as logged out made
        agent calls fail whenever the CPU was busy (e.g. a local Ollama model running).
        """
        global _last_known_cli_login
        completed = run_cli_quietly([cli_path, "auth", "status", "--json"], timeout_seconds=45)
        if completed is None:
            logger.warning("`claude auth status` didn't answer; using last known login state")
            return _last_known_cli_login
        try:
            _last_known_cli_login = completed.returncode == 0 and bool(json.loads(completed.stdout).get("loggedIn"))
        except json.JSONDecodeError:
            return _last_known_cli_login
        return _last_known_cli_login

    # ---------- login ----------

    def start_browser_login(self) -> LoginStartResponse:
        cli_path = find_cli_executable("claude")
        if not cli_path:
            return LoginStartResponse(
                started=False,
                message="Claude Code isn't installed. Install it from https://claude.com/claude-code, or paste an API key instead.",
            )
        if open_visible_login_terminal([cli_path, "auth", "login"], "Claude login"):
            return LoginStartResponse(
                started=True,
                message="A terminal window opened — finish signing in to Claude in your browser, then click 'Check status'.",
            )
        return LoginStartResponse(started=False, message="Run `claude auth login` in a terminal, then click 'Check status'.")

    # ---------- generation ----------

    def generate_text(self, prompt: str, model_name: str | None = None, json_schema: dict | None = None) -> str:
        model = model_name or self._settings.claude_default_model
        api_key = get_api_key(self.provider_id)
        if api_key:
            return self._generate_with_api_key(api_key, prompt, model)

        cli_path = find_cli_executable("claude")
        if cli_path and self._is_cli_logged_in(cli_path):
            return self._generate_with_cli(cli_path, prompt, model)

        raise ProviderNotConnectedError("Claude isn't connected — log in with your Claude account or save an API key.")

    def _generate_with_cli(self, cli_path: str, prompt: str, model: str) -> str:
        command = [
            cli_path, "-p",
            "--model", cli_model_alias(model),
            "--output-format", "text",
            "--tools", "",  # plain text answer; the agent must not read files or run commands
            "--no-session-persistence",
        ]
        return run_cli_with_prompt_on_stdin(command, prompt, self._settings.llm_timeout_seconds, self.display_name)

    def _generate_with_api_key(self, api_key: str, prompt: str, model: str) -> str:
        client = anthropic.Anthropic(api_key=api_key, timeout=self._settings.llm_timeout_seconds)
        extra: dict = {}
        if model in MODELS_SUPPORTING_DEFAULT_FALLBACK:
            # If a safety classifier declines, the API retries on a suitable model in the same call.
            extra = {"betas": ["server-side-fallback-2026-07-01"], "fallbacks": "default"}
        try:
            response = client.beta.messages.create(
                model=model,
                max_tokens=API_MAX_OUTPUT_TOKENS,
                output_config={"effort": "high"},
                messages=[{"role": "user", "content": prompt}],
                **extra,
            )
        except anthropic.AuthenticationError as exc:
            raise ProviderNotConnectedError("Anthropic rejected the saved API key — check or replace it.") from exc
        except anthropic.NotFoundError as exc:
            raise ProviderCallError(f"Claude model '{model}' isn't available to this API key.") from exc
        except anthropic.RateLimitError as exc:
            raise ProviderCallError("Anthropic rate limit hit — wait a moment and try again.") from exc
        except anthropic.APIStatusError as exc:
            raise ProviderCallError(f"Anthropic API error {exc.status_code}: {exc.message}") from exc
        except anthropic.APIConnectionError as exc:
            raise ProviderCallError("Couldn't reach the Anthropic API — check your internet connection.") from exc

        if response.stop_reason == "refusal":
            raise ProviderCallError("Claude declined to answer this request.")
        text = "".join(block.text for block in response.content if block.type == "text")
        if not text.strip():
            raise ProviderCallError("Claude returned an empty response.")
        return text
