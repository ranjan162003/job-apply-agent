"""Uploaded resumes and the "import into my profile" preview."""
from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, Field

from app.core.utc_time import UtcDatetime
from app.schemas.profile_schemas import EducationIn, ExperienceIn
from app.schemas.provider_schemas import ProviderId


class ResumeOut(BaseModel):
    id: int
    name: str
    original_filename: str
    content_type: str
    size_bytes: int
    is_default: bool
    created_at: UtcDatetime
    text_characters: int


class ResumeUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    is_default: bool | None = None


class ImportRequest(BaseModel):
    """Which model reads the resume. Without one, only emails, phone numbers and links are found."""

    provider_id: ProviderId | None = None
    model_name: str | None = None


class SuggestionSource(str, Enum):
    PATTERN = "pattern"  # found by a regular expression (email, phone, links)
    AI = "ai"


class FieldSuggestion(BaseModel):
    key: str
    label: str
    section_title: str
    current_value: str | None
    suggested_value: str
    source: SuggestionSource
    is_change: bool = Field(description="False when the vault already holds this exact value.")


class ImportPreview(BaseModel):
    resume_id: int
    used_ai: bool
    fields: list[FieldSuggestion]
    experiences: list[ExperienceIn]
    educations: list[EducationIn]
    note: str | None = None


class ImportApplyRequest(BaseModel):
    """What the user ticked in the preview. Lists replace the current ones only when given."""

    values: dict[str, str] = {}
    experiences: list[ExperienceIn] | None = Field(default=None, max_length=30)
    educations: list[EducationIn] | None = Field(default=None, max_length=15)
