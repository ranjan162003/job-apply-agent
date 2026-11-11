"""Fill repeated blocks ("Work Experience 2", "Education 1") from the profile's lists.

The block comes from the field's section heading; its number picks the job or school
(1 = the first one in the profile). The field inside the block is recognised from its label,
or from its id (Workday ids look like `workExperience-12--startDate-dateSectionMonth-input`).
"""
from __future__ import annotations

import re
from dataclasses import dataclass

from app.matching.option_picker import normalize
from app.schemas.match_schemas import PageField

JOB_SECTION = re.compile(r"(work|employment|professional|job)\s*(experience|history)|^experience|employment")
SCHOOL_SECTION = re.compile(r"education|school|academic|qualification")
SECTION_NUMBER = re.compile(r"(\d+)\s*$")

# (entry attribute, label pattern, id pattern) — first match wins, so specific ones come first.
JOB_FIELDS: list[tuple[str, str, str]] = [
    ("is_current", r"currently (work|employed)|i work here|current(ly)? (job|role|position|employer)|present (job|employer)", r"currentlyWorkHere|current"),
    ("description", r"description|responsibilit|duties|what (did|do) you do|achievements", r"roleDescription|description"),
    ("start_date", r"^from( |$)|start date|^start|date joined|^joined", r"startDate|fromDate"),
    ("end_date", r"^to( |$)|end date|^end|until|^left", r"endDate|toDate"),
    ("title", r"title|designation|^role$|^position$", r"jobTitle|title"),
    ("company", r"company|employer|organi[sz]ation", r"companyName|company|employer"),
    ("location", r"location|city", r"location"),
]
SCHOOL_FIELDS: list[tuple[str, str, str]] = [
    ("school", r"school|university|institution|college|institute", r"school|university|institution"),
    ("degree", r"degree|qualification|level of education", r"degree"),
    ("field_of_study", r"field of study|major|discipline|speciali[sz]ation|^course|stream", r"fieldOfStudy|major"),
    ("grade", r"gpa|grade|overall result|percentage|score|marks", r"gradeAverage|gpa|grade"),
    ("start_year", r"^from( |$)|^start|start (date|year)", r"firstYearAttended|startDate|fromDate"),
    ("end_year", r"^to( |$)|^end|end (date|year)|graduat|passing|completion", r"lastYearAttended|endDate|toDate"),
]
LABELS = {
    "is_current": "I currently work here", "description": "What you did", "start_date": "Start", "end_date": "End",
    "title": "Job title", "company": "Company", "location": "Location", "school": "College / school", "degree": "Degree",
    "field_of_study": "Field of study", "grade": "CGPA / %", "start_year": "Start year", "end_year": "End year",
}


@dataclass(frozen=True)
class EntryField:
    kind: str  # "job" | "school"
    index: int  # 1-based, as on the page
    attribute: str
    date_part: str | None  # "month" / "year" for split date inputs (Workday spinbuttons)

    @property
    def label(self) -> str:
        noun = "Job" if self.kind == "job" else "Education"
        return f"{noun} {self.index} · {LABELS[self.attribute]}"


def block_of(section: str | None) -> tuple[str, int] | None:
    if not section:
        return None
    text = normalize(section)
    number = SECTION_NUMBER.search(text)
    index = int(number.group(1)) if number else 1
    if SCHOOL_SECTION.search(text):
        return "school", index
    if JOB_SECTION.search(text):
        return "job", index
    return None


def find_entry_field(field: PageField) -> EntryField | None:
    block = block_of(field.section)
    if block is None:
        return None
    kind, index = block
    label = normalize(field.label or field.placeholder or "")
    identifiers = " ".join(filter(None, (field.name, field.html_id)))
    date_part = None
    if label in ("month", "mm") or re.search(r"Month", identifiers):
        date_part = "month"
    elif label in ("year", "yyyy") or re.search(r"Year-input|dateSectionYear", identifiers):
        date_part = "year"

    for attribute, label_pattern, id_pattern in JOB_FIELDS if kind == "job" else SCHOOL_FIELDS:
        if (label and date_part is None and re.search(label_pattern, label)) or (identifiers and re.search(id_pattern, identifiers)):
            return EntryField(kind, index, attribute, date_part)
    return None


def entry_value(entry_field: EntryField, entry: dict, field: PageField) -> str | None:
    """The entry's value, shaped for the field (dates as the input expects them)."""
    raw = entry.get(entry_field.attribute)
    if entry_field.attribute == "is_current":
        return "true" if raw else "false"
    if entry_field.attribute in ("start_date", "end_date"):
        if entry_field.attribute == "end_date" and entry.get("is_current"):
            return None  # nothing to type: "I currently work here" covers it
        if not raw:
            return None
        year, month = raw.split("-")
        if entry_field.date_part == "month":
            return month
        if entry_field.date_part == "year":
            return year
        if field.kind == "date":
            return f"{year}-{month}-01"
        placeholder = (field.placeholder or "").upper()
        return year if placeholder == "YYYY" else f"{month}/{year}"
    return str(raw) if raw not in (None, "") else None
