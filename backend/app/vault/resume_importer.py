"""Turn a resume into suggested profile values for the user to review.

Two passes:
* patterns: emails, phone numbers and profile links, found with regular expressions.
  Always runs, needs no model, and wins over the AI for those fields;
* AI: everything else (names, titles, experience, education), when a model is chosen.

Nothing is saved here. The preview goes back to the user, who ticks what to keep.
Fields marked `never_ai` (salary, work authorisation, diversity) are never suggested.
"""
from __future__ import annotations

import logging
import re

from sqlalchemy.orm import Session

from app.agents.providers.llm_provider_registry import get_llm_provider
from app.agents.resume_reader_agent import ExtractedEducation, ExtractedExperience, ResumeReaderAgent
from app.core.app_exceptions import InvalidRequestError
from app.schemas.profile_schemas import EducationIn, ExperienceIn
from app.schemas.resume_schemas import FieldSuggestion, ImportApplyRequest, ImportPreview, ImportRequest, SuggestionSource
from app.vault import profile_service
from app.vault.profile_catalog import fields_by_key, load_catalog
from app.vault.resume_service import get_resume

logger = logging.getLogger(__name__)

_EMAIL = re.compile(r"(?<![\w.+-])[\w.+-]+@[\w-]+(?:\.[\w-]+)+")
# A phone number: optional +country code, then at least 8 more digits with common separators.
_PHONE = re.compile(r"(?<![\w/])(\+\d{1,3}[ \t-]?)?(\(?\d{2,5}\)?[ \t.-]?){1,4}\d{2,5}(?![\w/])")
# Things that look like phone numbers but are dates or year ranges.
_NOT_A_PHONE = re.compile(r"(19|20)\d{2}\s*[-–]\s*(19|20)\d{2}|\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{4}")
_LINK_PATTERNS = {
    "linkedin_url": re.compile(r"(?:https?://)?(?:[a-z]{2,3}\.)?linkedin\.com/in/[\w%-]+/?", re.IGNORECASE),
    "github_url": re.compile(r"(?:https?://)?(?:www\.)?github\.com/[A-Za-z0-9-]+(?![\w/-])", re.IGNORECASE),
    "leetcode_url": re.compile(r"(?:https?://)?(?:www\.)?leetcode\.com/(?:u/)?[\w-]+/?", re.IGNORECASE),
}
_MONTHS = {name: index for index, names in enumerate(
    [("jan", "january"), ("feb", "february"), ("mar", "march"), ("apr", "april"), ("may",), ("jun", "june"),
     ("jul", "july"), ("aug", "august"), ("sep", "sept", "september"), ("oct", "october"), ("nov", "november"),
     ("dec", "december")], start=1) for name in names}
_PRESENT = {"present", "current", "now", "till date", "today", "ongoing"}


def find_patterns(text: str) -> dict[str, str]:
    found: dict[str, str] = {}
    if email := _EMAIL.search(text):
        found["email"] = email.group(0).rstrip(".")
    for match in _PHONE.finditer(text):
        candidate = match.group(0).strip()
        digits = re.sub(r"\D", "", candidate)
        if 8 <= len(digits) <= 15 and not _NOT_A_PHONE.fullmatch(candidate):
            code, number = _split_country_code(candidate)
            if code:
                found["phone_country_code"] = code
            found["phone"] = number
            break
    for key, pattern in _LINK_PATTERNS.items():
        if link := pattern.search(text):
            url = link.group(0).rstrip("/")
            found[key] = url if url.lower().startswith("http") else f"https://{url}"
    return found


def _split_country_code(phone: str) -> tuple[str | None, str]:
    match = re.match(r"^\+(\d{1,3})[\s-]+(.+)$", phone)
    if match:
        return f"+{match.group(1)}", match.group(2).strip()
    # "+919876543210": an Indian mobile number written without a space.
    match = re.match(r"^\+91(\d{10})$", phone)
    if match:
        return "+91", match.group(1)
    return None, phone


def normalize_month(raw: str | None) -> str:
    """'Jan 2022', '01/2022', '2022-01', '2022' → '2022-01'. Anything else → ''."""
    if not raw:
        return ""
    text = raw.strip().lower().replace(".", "")
    if text in _PRESENT:
        return ""
    if match := re.fullmatch(r"(\d{4})-(\d{1,2})(?:-\d{1,2})?", text):
        year, month = int(match.group(1)), int(match.group(2))
    elif match := re.fullmatch(r"(\d{1,2})[/-](\d{4})", text):
        month, year = int(match.group(1)), int(match.group(2))
    elif match := re.fullmatch(r"([a-z]+)[\s,'-]*(\d{4})", text):
        month, year = _MONTHS.get(match.group(1), 0), int(match.group(2))
    elif match := re.fullmatch(r"(\d{4})", text):
        year, month = int(match.group(1)), 1
    else:
        return ""
    return f"{year:04d}-{month:02d}" if 1 <= month <= 12 and 1950 <= year <= 2100 else ""


def _normalize_year(raw: str | int | None) -> str:
    match = re.search(r"(19|20)\d{2}", str(raw or ""))
    return match.group(0) if match else ""


def _clean_experiences(items: list[ExtractedExperience]) -> list[ExperienceIn]:
    cleaned: list[ExperienceIn] = []
    for item in items:
        if not item.title.strip() or not item.company.strip():
            continue
        is_current = item.is_current or (item.end_date or "").strip().lower() in _PRESENT
        cleaned.append(
            ExperienceIn(
                title=item.title.strip()[:200],
                company=item.company.strip()[:200],
                location=(item.location or "").strip()[:200],
                start_date=normalize_month(item.start_date),
                end_date="" if is_current else normalize_month(item.end_date),
                is_current=is_current,
                description=(item.description or "").strip()[:5000],
            )
        )
    return cleaned


def _clean_educations(items: list[ExtractedEducation]) -> list[EducationIn]:
    return [
        EducationIn(
            school=item.school.strip()[:200],
            degree=(item.degree or "").strip()[:200],
            field_of_study=(item.field_of_study or "").strip()[:200],
            start_year=_normalize_year(item.start_year),
            end_year=_normalize_year(item.end_year),
            grade=(item.grade or "").strip()[:50],
        )
        for item in items
        if item.school.strip()
    ]


def preview_import(session: Session, resume_id: int, request: ImportRequest) -> ImportPreview:
    resume = get_resume(session, resume_id)
    if not resume.text.strip():
        raise InvalidRequestError(
            "No text could be read from this resume (it may be a scanned image). Upload a text-based PDF or DOCX."
        )

    catalog = fields_by_key()
    allowed = [field for section in load_catalog() for field in section.fields if not field.never_ai]
    suggestions: dict[str, tuple[str, SuggestionSource]] = {}
    experiences: list[ExperienceIn] = []
    educations: list[EducationIn] = []
    note: str | None = None

    if request.provider_id is not None:
        agent = ResumeReaderAgent(get_llm_provider(request.provider_id), request.model_name)
        values, raw_experiences, raw_educations = agent.read(resume.text, allowed)
        suggestions.update({key: (value, SuggestionSource.AI) for key, value in values.items()})
        experiences = _clean_experiences(raw_experiences)
        educations = _clean_educations(raw_educations)
    else:
        note = "No model was chosen, so only your email, phone number and profile links were read."

    # Patterns are exact, so they replace whatever the model said for the same field.
    suggestions.update({key: (value, SuggestionSource.PATTERN) for key, value in find_patterns(resume.text).items()})

    current = profile_service.get_values(session)
    section_title = {field.key: section.title for section in load_catalog() for field in section.fields}
    fields: list[FieldSuggestion] = []
    for key in catalog:  # catalog order, so the preview reads like the profile page
        if key not in suggestions or catalog[key].never_ai:
            continue
        raw_value, source = suggestions[key]
        try:
            value = profile_service.normalize_value(catalog[key], raw_value)
        except InvalidRequestError:
            logger.info("Skipping %s: %r doesn't fit the field type.", key, raw_value)
            continue
        if value is None:
            continue
        fields.append(
            FieldSuggestion(
                key=key,
                label=catalog[key].label,
                section_title=section_title[key],
                current_value=current.get(key),
                suggested_value=value,
                source=source,
                is_change=current.get(key) != value,
            )
        )

    return ImportPreview(
        resume_id=resume.id,
        used_ai=request.provider_id is not None,
        fields=fields,
        experiences=experiences,
        educations=educations,
        note=note,
    )


def apply_import(session: Session, request: ImportApplyRequest) -> None:
    if request.values:
        profile_service.update_values(session, dict(request.values))
    if request.experiences is not None:
        profile_service.replace_experiences(session, request.experiences)
    if request.educations is not None:
        profile_service.replace_educations(session, request.educations)
