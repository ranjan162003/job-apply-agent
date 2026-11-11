"""The extension sends a page's fields; the backend answers with what to fill in each."""
from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, Field


class PageField(BaseModel):
    """One field as the content script saw it (see extension/src/shared/fields.ts)."""

    id: str = Field(max_length=64)
    kind: str = Field(max_length=32)
    label: str = Field(default="", max_length=400)
    options: list[str] = Field(default=[], max_length=400)
    name: str | None = Field(default=None, max_length=300)
    html_id: str | None = Field(default=None, max_length=300)
    autocomplete: str | None = Field(default=None, max_length=100)
    placeholder: str | None = Field(default=None, max_length=300)
    max_length: int | None = None
    section: str | None = Field(default=None, max_length=300)


class MatchRequest(BaseModel):
    site: str = Field(default="generic", max_length=32)
    fields: list[PageField] = Field(max_length=500)


class MatchStatus(str, Enum):
    FILL = "fill"  # we know the value
    EMPTY_IN_PROFILE = "empty_in_profile"  # we know which profile field, but it's empty
    NO_OPTION = "no_option"  # the profile value isn't one of the field's choices
    UNKNOWN = "unknown"  # we don't know what this field asks
    SKIPPED = "skipped"  # never filled for you (consent boxes, unsupported widgets)


class FieldMatch(BaseModel):
    id: str
    status: MatchStatus
    profile_key: str | None = None
    profile_label: str | None = None
    value: str | None = None
    resume_id: int | None = Field(default=None, description="File fields: the resume to upload.")
    resume_filename: str | None = None
    pick_from_list: bool = Field(default=False, description="Open the dropdown, then ask /api/ext/pick which choice to click.")
    note: str | None = None


class MatchResponse(BaseModel):
    matches: list[FieldMatch]


class PickRequest(BaseModel):
    """The choices a dropdown showed once opened, and the answer to find among them."""

    value: str = Field(max_length=500)
    options: list[str] = Field(max_length=1000)


class PickResponse(BaseModel):
    option: str | None
