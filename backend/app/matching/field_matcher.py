"""Decide what goes into each field on an application form, using rules only (no AI).

For each field: the HTML autocomplete attribute, then the name/id attribute, then the label
are checked against `synonyms.yaml`. The profile value is then shaped for the field: a choice
picked from its options, cut to its max length, or a resume for a file upload.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

import yaml

from app.matching.entry_matcher import EntryField, entry_value, find_entry_field
from app.matching.option_picker import normalize, pick_option
from app.schemas.match_schemas import FieldMatch, MatchStatus, PageField

SYNONYMS_PATH = Path(__file__).with_name("synonyms.yaml")
CHOICE_KINDS = {"select", "radio", "custom-select"}
TEXT_KINDS = {"text", "email", "tel", "url", "number", "date", "textarea", "combobox"}
# Checkboxes that confirm something about you are never ticked for you.
CONSENT_WORDS = re.compile(r"agree|certif|consent|acknowledg|confirm|declare|attest|accept|terms|privacy", re.IGNORECASE)
RESUME_WORDS = re.compile(r"resume|résumé|\bcv\b|curriculum", re.IGNORECASE)
COVER_LETTER_WORDS = re.compile(r"cover\s*letter", re.IGNORECASE)

DERIVED_LABELS = {
    "full_name": "Full name",
    "phone_full": "Phone with country code",
    "current_location": "Current location",
    "current_role_description": "What you did (newest job)",
}


@dataclass(frozen=True)
class Entries:
    """The profile's lists, as plain dicts: jobs newest first, schools highest first."""

    jobs: list[dict]
    schools: list[dict]


@dataclass(frozen=True)
class Rule:
    key: str
    autocomplete: tuple[str, ...]
    names: tuple[re.Pattern[str], ...]
    labels: tuple[re.Pattern[str], ...]
    not_labels: tuple[re.Pattern[str], ...]


@lru_cache
def load_rules() -> tuple[Rule, ...]:
    raw = yaml.safe_load(SYNONYMS_PATH.read_text(encoding="utf-8"))["rules"]
    return tuple(
        Rule(
            key=rule["key"],
            autocomplete=tuple(rule.get("autocomplete", [])),
            names=tuple(re.compile(p, re.IGNORECASE) for p in rule.get("names", [])),
            labels=tuple(re.compile(p) for p in rule.get("labels", [])),
            not_labels=tuple(re.compile(p) for p in rule.get("not_labels", [])),
        )
        for rule in raw
    )


def derived_values(values: dict[str, str], newest_job: dict[str, str] | None = None) -> dict[str, str]:
    """Profile values plus the combinations forms often ask for.

    `newest_job` (the first entry of Work experience) fills the "current job" questions the
    profile fields leave empty, and gives the role description.
    """
    combined = dict(values)
    if newest_job:
        combined.setdefault("current_title", newest_job.get("title", ""))
        combined.setdefault("current_company", newest_job.get("company", ""))
        if newest_job.get("description"):
            combined["current_role_description"] = newest_job["description"]
        combined = {key: value for key, value in combined.items() if value}
    first = values.get("preferred_name") or values.get("first_name")
    if values.get("first_name") and values.get("last_name"):
        combined["full_name"] = f"{values['first_name']} {values['last_name']}"
    if first and not values.get("preferred_name"):
        combined["preferred_name"] = first
    if values.get("phone"):
        code = values.get("phone_country_code", "")
        combined["phone_full"] = f"{code} {values['phone']}".strip()
    location = ", ".join(v for v in (values.get("city"), values.get("country")) if v)
    if location:
        combined["current_location"] = location
    return combined


def find_key(field: PageField) -> str | None:
    label = normalize(field.label or field.placeholder or "")
    identifiers = " ".join(filter(None, (field.name, field.html_id)))
    autocomplete = (field.autocomplete or "").lower().split()
    rules = [rule for rule in load_rules() if not (label and any(p.search(label) for p in rule.not_labels))]
    # Strongest signal first, across all rules: autocomplete, then the visible label, then name/id.
    for rule in rules:
        if any(token in rule.autocomplete for token in autocomplete):
            return rule.key
    if label:
        for rule in rules:
            if any(p.search(label) for p in rule.labels):
                return rule.key
    if identifiers:
        for rule in rules:
            if any(p.search(identifiers) for p in rule.names):
                return rule.key
    return None


def _shape_choice_or_text(field: PageField, key: str, label: str, value: str) -> FieldMatch:
    """Fit a known value to the field: pick a choice, or cut text to the field's max length."""
    if field.kind in CHOICE_KINDS or field.kind == "combobox":
        if not field.options and field.kind in ("custom-select", "combobox"):
            # The choices only appear after the dropdown is opened: the extension opens it,
            # then asks /api/ext/pick which one to click.
            return FieldMatch(id=field.id, status=MatchStatus.FILL, profile_key=key, profile_label=label, value=value, pick_from_list=True)
        if field.options:
            option = pick_option(value, field.options)
            if option is None:
                return FieldMatch(id=field.id, status=MatchStatus.NO_OPTION, profile_key=key, profile_label=label, value=value,
                                  note=f"Your answer “{value}” isn't one of the choices.")
            value = option
    elif field.kind not in TEXT_KINDS:
        return FieldMatch(id=field.id, status=MatchStatus.SKIPPED, profile_key=key, profile_label=label)
    if field.max_length and len(value) > field.max_length:
        value = value[: field.max_length]
    return FieldMatch(id=field.id, status=MatchStatus.FILL, profile_key=key, profile_label=label, value=value)


def match_entry_field(field: PageField, entry_field: EntryField, entries: Entries) -> FieldMatch:
    items = entries.jobs if entry_field.kind == "job" else entries.schools
    key = f"{'experience' if entry_field.kind == 'job' else 'education'}[{entry_field.index}].{entry_field.attribute}"
    if entry_field.index > len(items):
        noun = "job" if entry_field.kind == "job" else "education entry"
        return FieldMatch(id=field.id, status=MatchStatus.EMPTY_IN_PROFILE, profile_key=key, profile_label=entry_field.label,
                          note=f"Your profile has no {noun} number {entry_field.index}.")
    value = entry_value(entry_field, items[entry_field.index - 1], field)
    if entry_field.attribute == "is_current":
        if field.kind != "checkbox":
            return FieldMatch(id=field.id, status=MatchStatus.SKIPPED, profile_key=key, profile_label=entry_field.label)
        return FieldMatch(id=field.id, status=MatchStatus.FILL, profile_key=key, profile_label=entry_field.label, value=value)
    if value is None:
        if entry_field.attribute == "end_date":
            return FieldMatch(id=field.id, status=MatchStatus.SKIPPED, profile_key=key, profile_label=entry_field.label,
                              note="Current job: no end date.")
        return FieldMatch(id=field.id, status=MatchStatus.EMPTY_IN_PROFILE, profile_key=key, profile_label=entry_field.label,
                          note=f"“{entry_field.label}” is empty in your profile.")
    return _shape_choice_or_text(field, key, entry_field.label, value)


def match_field(
    field: PageField,
    values: dict[str, str],
    key_labels: dict[str, str],
    default_resume: tuple[int, str] | None,
    entries: Entries | None = None,
) -> FieldMatch:
    entry_field = find_entry_field(field) if entries is not None and field.kind != "file" else None
    if entry_field is not None:
        return match_entry_field(field, entry_field, entries)  # type: ignore[arg-type]

    if field.kind == "file":
        if COVER_LETTER_WORDS.search(field.label):
            return FieldMatch(id=field.id, status=MatchStatus.SKIPPED, note="Cover letters come in a later version.")
        if RESUME_WORDS.search(f"{field.label} {field.name or ''}") or not field.label:
            if default_resume is None:
                return FieldMatch(id=field.id, status=MatchStatus.EMPTY_IN_PROFILE, note="Upload a resume in the dashboard first.")
            resume_id, filename = default_resume
            return FieldMatch(id=field.id, status=MatchStatus.FILL, resume_id=resume_id, resume_filename=filename, value=filename)
        return FieldMatch(id=field.id, status=MatchStatus.UNKNOWN)

    if field.kind == "checkbox":
        note = "Tick this yourself after reading it." if CONSENT_WORDS.search(field.label) else None
        return FieldMatch(id=field.id, status=MatchStatus.SKIPPED, note=note or "Checkboxes are left to you.")
    if field.kind == "checkbox-group":
        return FieldMatch(id=field.id, status=MatchStatus.SKIPPED, note="Pick these yourself.")

    key = find_key(field)
    if key is None:
        return FieldMatch(id=field.id, status=MatchStatus.UNKNOWN)
    label = key_labels.get(key) or DERIVED_LABELS.get(key, key)
    value = values.get(key)
    if not value:
        return FieldMatch(id=field.id, status=MatchStatus.EMPTY_IN_PROFILE, profile_key=key, profile_label=label,
                          note=f"“{label}” is empty in your profile.")

    return _shape_choice_or_text(field, key, label, value)
