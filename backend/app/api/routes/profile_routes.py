"""Profile vault: field values, experiences and education."""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.database_session import get_db_session
from app.schemas.profile_schemas import (
    EducationListRequest,
    EducationOut,
    ExperienceListRequest,
    ExperienceOut,
    ProfileResponse,
    ProfileUpdateRequest,
)
from app.vault import profile_service

router = APIRouter(prefix="/profile", tags=["profile"])


@router.get("", response_model=ProfileResponse)
def read_profile(session: Session = Depends(get_db_session)) -> ProfileResponse:
    return profile_service.get_profile(session)


@router.patch("", response_model=ProfileResponse)
def update_profile(body: ProfileUpdateRequest, session: Session = Depends(get_db_session)) -> ProfileResponse:
    profile_service.update_values(session, body.values)
    return profile_service.get_profile(session)


@router.put("/experiences", response_model=list[ExperienceOut])
def replace_experiences(body: ExperienceListRequest, session: Session = Depends(get_db_session)) -> list[ExperienceOut]:
    return profile_service.replace_experiences(session, body.experiences)


@router.put("/educations", response_model=list[EducationOut])
def replace_educations(body: EducationListRequest, session: Session = Depends(get_db_session)) -> list[EducationOut]:
    return profile_service.replace_educations(session, body.educations)
