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
}


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


def derived_values(values: dict[str, str]) -> dict[str, str]:
    """Profile values plus the combinations forms often ask for."""
    combined = dict(values)
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


def match_field(
    field: PageField,
    values: dict[str, str],
    key_labels: dict[str, str],
    default_resume: tuple[int, str] | None,
) -> FieldMatch:
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

    if field.kind in CHOICE_KINDS:
        if field.kind == "custom-select" and not field.options:
            return FieldMatch(id=field.id, status=MatchStatus.SKIPPED, profile_key=key, profile_label=label, value=value,
                              note="This dropdown type is filled in a later version.")
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
