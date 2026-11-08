"""Pair the browser extension with this backend using a shared token.

The dashboard creates a random token and shows it once. The user pastes it into the
extension, which sends it as `X-Apply-Copilot-Token` on every request. Only a SHA-256
hash is stored, so the database alone can't be used to talk to the API.
"""
from __future__ import annotations

import hashlib
import hmac
import secrets
from datetime import datetime, timezone

from fastapi import Depends, Header
from sqlalchemy.orm import Session

from app.core.app_exceptions import ApplyCopilotError
from app.db.database_session import get_db_session
from app.db.orm_models import AppSetting
from app.schemas.pairing_schemas import PairingCode, PairingStatus

TOKEN_SETTING_KEY = "extension_token_sha256"
TOKEN_HEADER = "X-Apply-Copilot-Token"


class ExtensionNotPairedError(ApplyCopilotError):
    status_code = 401


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def pairing_status(session: Session) -> PairingStatus:
    row = session.get(AppSetting, TOKEN_SETTING_KEY)
    return PairingStatus(is_paired=row is not None, paired_at=row.updated_at if row else None)


def create_pairing_code(session: Session) -> PairingCode:
    """A new token replaces the old one, so an old extension install stops working."""
    token = f"ac_{secrets.token_urlsafe(24)}"
    now = datetime.now(timezone.utc)
    row = session.get(AppSetting, TOKEN_SETTING_KEY)
    if row is None:
        session.add(AppSetting(key=TOKEN_SETTING_KEY, value=_hash(token), updated_at=now))
    else:
        row.value = _hash(token)
        row.updated_at = now
    session.commit()
    return PairingCode(token=token, paired_at=now)


def revoke_pairing(session: Session) -> None:
    row = session.get(AppSetting, TOKEN_SETTING_KEY)
    if row is not None:
        session.delete(row)
        session.commit()


def require_extension_token(
    token: str | None = Header(default=None, alias=TOKEN_HEADER),
    session: Session = Depends(get_db_session),
) -> None:
    """FastAPI dependency for every `/api/ext/*` route."""
    row = session.get(AppSetting, TOKEN_SETTING_KEY)
    if row is None:
        raise ExtensionNotPairedError("Not paired yet. Create a pairing code in the dashboard (Extension page).")
    if not token or not hmac.compare_digest(_hash(token), row.value):
        raise ExtensionNotPairedError("The pairing code is wrong or was replaced. Paste the current one.")
