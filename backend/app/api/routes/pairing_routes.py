"""Dashboard side of extension pairing: create, check and revoke the token."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.orm import Session

from app.db.database_session import get_db_session
from app.schemas.pairing_schemas import PairingCode, PairingStatus
from app.security import extension_pairing

router = APIRouter(prefix="/pairing", tags=["pairing"])


@router.get("", response_model=PairingStatus)
def read_pairing(session: Session = Depends(get_db_session)) -> PairingStatus:
    return extension_pairing.pairing_status(session)


@router.post("", response_model=PairingCode)
def create_pairing(session: Session = Depends(get_db_session)) -> PairingCode:
    return extension_pairing.create_pairing_code(session)


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
def revoke_pairing(session: Session = Depends(get_db_session)) -> Response:
    extension_pairing.revoke_pairing(session)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
