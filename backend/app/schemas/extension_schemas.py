"""What the extension reads from the vault."""
from __future__ import annotations

from pydantic import BaseModel

from app.schemas.profile_schemas import EducationOut, ExperienceOut
from app.schemas.resume_schemas import ResumeOut


class ExtensionProfile(BaseModel):
    values: dict[str, str]
    never_ai_keys: list[str]
    experiences: list[ExperienceOut]
    educations: list[EducationOut]
    resumes: list[ResumeOut]
