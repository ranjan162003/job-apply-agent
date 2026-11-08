"""Routes the browser extension calls. Every one needs the pairing token."""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.app_settings import APP_VERSION, get_settings
from app.db.database_session import get_db_session
from app.schemas.extension_schemas import ExtensionProfile
from app.schemas.pairing_schemas import ExtensionHello
from app.security.extension_pairing import require_extension_token
from app.vault import profile_service, resume_service
from app.vault.profile_catalog import fields_by_key

router = APIRouter(prefix="/ext", tags=["extension"], dependencies=[Depends(require_extension_token)])


@router.get("/hello", response_model=ExtensionHello)
def hello(session: Session = Depends(get_db_session)) -> ExtensionHello:
    values = profile_service.get_values(session)
    return ExtensionHello(
        app_name=get_settings().app_name,
        version=APP_VERSION,
        profile_completeness=profile_service.completeness(values).percent,
    )


@router.get("/profile", response_model=ExtensionProfile)
def read_profile(session: Session = Depends(get_db_session)) -> ExtensionProfile:
    return ExtensionProfile(
        values=profile_service.get_values(session),
        never_ai_keys=[key for key, field in fields_by_key().items() if field.never_ai],
        experiences=profile_service.list_experiences(session),
        educations=profile_service.list_educations(session),
        resumes=resume_service.list_resumes(session),
    )
