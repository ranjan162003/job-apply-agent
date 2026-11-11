"""Read and write the profile vault: field values, experiences and education."""
from __future__ import annotations

import re
from datetime import date

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.core.app_exceptions import InvalidRequestError
from app.db.orm_models import Education, Experience, ProfileValue
from app.schemas.profile_schemas import (
    CatalogField,
    Completeness,
    EducationIn,
    EducationOut,
    ExperienceIn,
    ExperienceOut,
    FieldType,
    ProfileFieldView,
    ProfileResponse,
    ProfileSectionView,
)
from app.vault.profile_catalog import fields_by_key, load_catalog

# The fields almost every application asks for; completeness is measured on these.
CORE_KEYS = (
    "first_name",
    "last_name",
    "email",
    "phone",
    "city",
    "country",
    "linkedin_url",
    "current_title",
    "total_experience_years",
    "notice_period_days",
    "expected_ctc",
    "highest_degree",
    "university",
    "graduation_year",
    "needs_sponsorship",
)
MAX_VALUE_LENGTH = 5000

_EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_PHONE = re.compile(r"^[0-9 ()+\-.]{4,25}$")
_NUMBER = re.compile(r"^\d+(\.\d+)?$")
_YES = {"yes", "y", "true", "1"}
_NO = {"no", "n", "false", "0"}


def normalize_value(field: CatalogField, raw: str | None) -> str | None:
    """Clean a value for `field`. Returns None for "clear it"; raises if it doesn't fit the type."""
    value = (raw or "").strip()
    if not value:
        return None
    if len(value) > MAX_VALUE_LENGTH:
        raise InvalidRequestError(f"{field.label} is too long (max {MAX_VALUE_LENGTH} characters).")

    if field.type == FieldType.EMAIL and not _EMAIL.match(value):
        raise InvalidRequestError(f"{field.label}: “{value}” isn't an email address.")
    if field.type == FieldType.TEL and not _PHONE.match(value):
        raise InvalidRequestError(f"{field.label}: “{value}” isn't a phone number.")
    if field.type == FieldType.URL:
        if " " in value or "." not in value:
            raise InvalidRequestError(f"{field.label}: “{value}” isn't a link.")
        if not re.match(r"^https?://", value, re.IGNORECASE):
            value = f"https://{value}"
    if field.type == FieldType.NUMBER:
        value = value.replace(",", "")
        if not _NUMBER.match(value):
            raise InvalidRequestError(f"{field.label}: “{value}” isn't a number.")
    if field.type == FieldType.DATE:
        try:
            date.fromisoformat(value)
        except ValueError as exc:
            raise InvalidRequestError(f"{field.label}: use the date format YYYY-MM-DD.") from exc
    if field.type == FieldType.YES_NO:
        lowered = value.lower()
        if lowered in _YES:
            value = "Yes"
        elif lowered in _NO:
            value = "No"
        else:
            raise InvalidRequestError(f"{field.label}: answer Yes or No.")
    if field.type == FieldType.SELECT:
        match = next((option for option in field.options if option.lower() == value.lower()), None)
        if match is None:
            raise InvalidRequestError(f"{field.label}: pick one of {', '.join(field.options)}.")
        value = match
    return value


def get_values(session: Session) -> dict[str, str]:
    """Saved values, with catalog defaults filled in for anything never set."""
    saved = {row.key: row.value for row in session.scalars(select(ProfileValue))}
    defaults = {key: field.default for key, field in fields_by_key().items() if field.default is not None}
    return {**defaults, **saved}


def update_values(session: Session, updates: dict[str, str | None]) -> None:
    catalog = fields_by_key()
    unknown = sorted(set(updates) - set(catalog))
    if unknown:
        raise InvalidRequestError(f"Unknown profile fields: {', '.join(unknown)}.")

    cleaned = {key: normalize_value(catalog[key], raw) for key, raw in updates.items()}  # validate all first
    for key, value in cleaned.items():
        row = session.get(ProfileValue, key)
        if value is None:
            if row is not None:
                session.delete(row)
        elif row is None:
            session.add(ProfileValue(key=key, value=value))
        else:
            row.value = value
    session.commit()


def list_experiences(session: Session) -> list[ExperienceOut]:
    rows = session.scalars(select(Experience).order_by(Experience.position, Experience.id))
    return [ExperienceOut.model_validate(row, from_attributes=True) for row in rows]


def replace_experiences(session: Session, experiences: list[ExperienceIn]) -> list[ExperienceOut]:
    session.execute(delete(Experience))
    for position, item in enumerate(experiences):
        data = item.model_dump()
        if data["is_current"]:
            data["end_date"] = ""
        session.add(Experience(position=position, **data))
    session.commit()
    return list_experiences(session)


def list_educations(session: Session) -> list[EducationOut]:
    rows = session.scalars(select(Education).order_by(Education.position, Education.id))
    return [EducationOut.model_validate(row, from_attributes=True) for row in rows]


def replace_educations(session: Session, educations: list[EducationIn]) -> list[EducationOut]:
    session.execute(delete(Education))
    for position, item in enumerate(educations):
        session.add(Education(position=position, **item.model_dump()))
    session.commit()
    return list_educations(session)


def completeness(values: dict[str, str]) -> Completeness:
    catalog = fields_by_key()
    missing = [catalog[key].label for key in CORE_KEYS if not values.get(key)]
    percent = round(100 * (len(CORE_KEYS) - len(missing)) / len(CORE_KEYS))
    return Completeness(percent=percent, missing=missing)


def get_profile(session: Session) -> ProfileResponse:
    values = get_values(session)
    sections = [
        ProfileSectionView(
            id=section.id,
            title=section.title,
            description=section.description,
            fields=[ProfileFieldView(**field.model_dump(), value=values.get(field.key)) for field in section.fields],
        )
        for section in load_catalog()
    ]
    return ProfileResponse(
        sections=sections,
        experiences=list_experiences(session),
        educations=list_educations(session),
        completeness=completeness(values),
    )
