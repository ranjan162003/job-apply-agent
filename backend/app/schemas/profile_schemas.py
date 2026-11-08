"""Profile vault: catalog of fields, current values, experiences and education."""
from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, Field


class FieldType(str, Enum):
    TEXT = "text"
    EMAIL = "email"
    TEL = "tel"
    URL = "url"
    NUMBER = "number"
    DATE = "date"
    TEXTAREA = "textarea"
    SELECT = "select"
    YES_NO = "yes_no"


class CatalogField(BaseModel):
    key: str
    label: str
    type: FieldType = FieldType.TEXT
    options: list[str] = []
    never_ai: bool = False
    default: str | None = None
    help: str | None = None


class CatalogSection(BaseModel):
    id: str
    title: str
    description: str | None = None
    fields: list[CatalogField]


class ProfileFieldView(CatalogField):
    value: str | None = None


class ProfileSectionView(BaseModel):
    id: str
    title: str
    description: str | None = None
    fields: list[ProfileFieldView]


class ExperienceIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    company: str = Field(min_length=1, max_length=200)
    location: str = Field(default="", max_length=200)
    start_date: str = Field(default="", pattern=r"^(\d{4}-(0[1-9]|1[0-2]))?$", description="YYYY-MM")
    end_date: str = Field(default="", pattern=r"^(\d{4}-(0[1-9]|1[0-2]))?$", description="YYYY-MM")
    is_current: bool = False
    description: str = Field(default="", max_length=5000)


class ExperienceOut(ExperienceIn):
    id: int


class EducationIn(BaseModel):
    school: str = Field(min_length=1, max_length=200)
    degree: str = Field(default="", max_length=200)
    field_of_study: str = Field(default="", max_length=200)
    start_year: str = Field(default="", pattern=r"^(\d{4})?$")
    end_year: str = Field(default="", pattern=r"^(\d{4})?$")
    grade: str = Field(default="", max_length=50)


class EducationOut(EducationIn):
    id: int


class Completeness(BaseModel):
    percent: int
    missing: list[str] = Field(description="Labels of the most-asked fields that are still empty.")


class ProfileResponse(BaseModel):
    sections: list[ProfileSectionView]
    experiences: list[ExperienceOut]
    educations: list[EducationOut]
    completeness: Completeness


class ProfileUpdateRequest(BaseModel):
    """Values to save. An empty string or null clears the field."""

    values: dict[str, str | None]


class ExperienceListRequest(BaseModel):
    experiences: list[ExperienceIn] = Field(max_length=30)


class EducationListRequest(BaseModel):
    educations: list[EducationIn] = Field(max_length=15)
