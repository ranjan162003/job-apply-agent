"""Shared helpers for providers that drive a vendor CLI (`claude`, `gemini`).

The vendor CLI owns the whole browser-login/OAuth flow; the backend only
(a) opens a visible terminal running the CLI's login command, and
(b) runs the CLI non-interactively with the prompt piped over stdin.
"""
from __future__ import annotations

import os
import shutil
import subprocess
import sys
import tempfile

from app.core.app_exceptions import ProviderCallError


def find_cli_executable(name: str) -> str | None:
    """Resolve a CLI on PATH, including Windows `.cmd` npm shims."""
    return shutil.which(name)


def run_cli_with_prompt_on_stdin(command: list[str], prompt: str, timeout_seconds: int, display_name: str) -> str:
    try:
        completed = subprocess.run(
            command,
            input=prompt,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=timeout_seconds,
            # Neutral working dir so project files / CLAUDE.md etc. never leak into the call.
            cwd=tempfile.gettempdir(),
        )
    except FileNotFoundError as exc:
        raise ProviderCallError(f"The {display_name} CLI isn't installed or isn't on PATH.") from exc
    except subprocess.TimeoutExpired as exc:
        raise ProviderCallError(f"{display_name} took longer than {timeout_seconds}s to respond.") from exc

    if completed.returncode != 0:
        detail = (completed.stderr or completed.stdout or "no output").strip()
        raise ProviderCallError(f"{display_name} CLI failed: {detail[:500]}")
    return completed.stdout


def run_cli_quietly(command: list[str], timeout_seconds: int = 20) -> subprocess.CompletedProcess[str] | None:
    """Run a short status-style command; returns None if it couldn't run at all."""
    try:
        return subprocess.run(
            command, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=timeout_seconds
        )
    except (OSError, subprocess.TimeoutExpired):
        return None


def open_visible_login_terminal(command: list[str], window_title: str) -> bool:
    """Launch the CLI's interactive login in its own terminal window.

    Returns False when the OS has no way for us to pop a window (e.g. a
    headless Linux box); the caller then tells the user which command to run.
    """
    if sys.platform == "win32":
        subprocess.Popen(command, creationflags=subprocess.CREATE_NEW_CONSOLE)
        return True
    if sys.platform == "darwin":
        shell_command = " ".join(_shell_quote(part) for part in command)
        subprocess.Popen(["osascript", "-e", f'tell application "Terminal" to do script "{shell_command}"'])
        return True
    for terminal in ("x-terminal-emulator", "gnome-terminal", "konsole", "xterm"):
        if shutil.which(terminal) and os.environ.get("DISPLAY"):
            subprocess.Popen([terminal, "-T", window_title, "-e", *command])
            return True
    return False


def _shell_quote(part: str) -> str:
    return "'" + part.replace("'", "'\\''") + "'"
