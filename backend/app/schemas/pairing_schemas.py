"""Pairing the browser extension with this backend."""
from __future__ import annotations

from pydantic import BaseModel

from app.core.utc_time import UtcDatetime


class PairingStatus(BaseModel):
    is_paired: bool
    paired_at: UtcDatetime | None = None


class PairingCode(BaseModel):
    """Shown once in the dashboard; the user pastes it into the extension."""

    token: str
    paired_at: UtcDatetime


class ExtensionHello(BaseModel):
    app_name: str
    version: str
    profile_completeness: int
