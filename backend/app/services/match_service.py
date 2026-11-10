"""Answer "what goes in each of these fields?" for the extension, from the profile vault."""
from __future__ import annotations

from sqlalchemy.orm import Session

from app.matching.field_matcher import derived_values, match_field
from app.schemas.match_schemas import MatchRequest, MatchResponse
from app.vault import profile_service, resume_service
from app.vault.profile_catalog import fields_by_key


def match_fields(session: Session, request: MatchRequest) -> MatchResponse:
    values = derived_values(profile_service.get_values(session))
    key_labels = {key: field.label for key, field in fields_by_key().items()}
    default = next((r for r in resume_service.list_resumes(session) if r.is_default), None)
    default_resume = (default.id, default.original_filename) if default else None
    return MatchResponse(matches=[match_field(field, values, key_labels, default_resume) for field in request.fields])
