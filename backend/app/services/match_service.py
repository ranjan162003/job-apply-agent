"""Answer "what goes in each of these fields?" for the extension, from the profile vault."""
from __future__ import annotations

from sqlalchemy.orm import Session

from app.matching.field_matcher import Entries, derived_values, match_field
from app.matching.option_picker import pick_option
from app.schemas.match_schemas import MatchRequest, MatchResponse, PickRequest, PickResponse
from app.vault import profile_service, resume_service
from app.vault.profile_catalog import fields_by_key


def match_fields(session: Session, request: MatchRequest) -> MatchResponse:
    experiences = profile_service.list_experiences(session)
    newest_job = experiences[0].model_dump() if experiences else None
    values = derived_values(profile_service.get_values(session), newest_job)
    key_labels = {key: field.label for key, field in fields_by_key().items()}
    default = next((r for r in resume_service.list_resumes(session) if r.is_default), None)
    default_resume = (default.id, default.original_filename) if default else None
    entries = Entries(
        jobs=[job.model_dump() for job in experiences],
        schools=[school.model_dump() for school in profile_service.list_educations(session)],
    )
    return MatchResponse(
        matches=[match_field(field, values, key_labels, default_resume, entries) for field in request.fields]
    )


def pick(request: PickRequest) -> PickResponse:
    return PickResponse(option=pick_option(request.value, request.options))
