"""Routes the browser extension calls. Every one needs the pairing token."""
from __future__ import annotations

from urllib.parse import quote

from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session

from app.core.app_settings import APP_VERSION, get_settings
from app.db.database_session import get_db_session
from app.schemas.extension_schemas import ExtensionProfile
from app.schemas.match_schemas import MatchRequest, MatchResponse, PickRequest, PickResponse
from app.schemas.pairing_schemas import ExtensionHello
from app.security.extension_pairing import require_extension_token
from app.services import match_service
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


@router.post("/match", response_model=MatchResponse)
def match(body: MatchRequest, session: Session = Depends(get_db_session)) -> MatchResponse:
    return match_service.match_fields(session, body)


@router.post("/pick", response_model=PickResponse)
def pick(body: PickRequest) -> PickResponse:
    """Which of an opened dropdown's choices matches the answer (null: none fits, leave it)."""
    return match_service.pick(body)


@router.get("/resumes/{resume_id}/file")
def resume_file(resume_id: int, session: Session = Depends(get_db_session)) -> Response:
    """The resume bytes, for the extension to attach to a file upload field."""
    resume, data = resume_service.read_resume_file(session, resume_id)
    return Response(
        content=data,
        media_type=resume.content_type,
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quote(resume.original_filename)}"},
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
