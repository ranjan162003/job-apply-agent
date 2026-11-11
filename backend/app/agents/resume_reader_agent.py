"""Reads a resume's text into suggested profile values, experiences and education."""
from __future__ import annotations

from pydantic import BaseModel, Field, create_model

from app.agents.llm_json import generate_validated_json
from app.agents.prompts.resume_prompts import build_resume_extraction_prompt
from app.agents.providers.base_llm_provider import BaseLlmProvider
from app.schemas.profile_schemas import CatalogField


class ExtractedExperience(BaseModel):
    """Loose on purpose: the importer normalises dates afterwards."""

    title: str = ""
    company: str = ""
    location: str | None = None
    start_date: str | None = None
    end_date: str | None = None
    is_current: bool = False
    description: str | None = None


class ExtractedEducation(BaseModel):
    school: str = ""
    degree: str | None = None
    field_of_study: str | None = None
    start_year: str | int | None = None
    end_year: str | int | None = None
    grade: str | None = None


def _extraction_model(fields: list[CatalogField]) -> type[BaseModel]:
    """One optional string property per allowed key, so the model can't invent keys."""
    field_model = create_model(
        "ResumeFields",
        **{field.key: (str | int | float | None, Field(default=None, description=field.label)) for field in fields},
    )
    return create_model(
        "ResumeExtraction",
        fields=(field_model, Field(default_factory=field_model)),
        experiences=(list[ExtractedExperience], Field(default_factory=list, max_length=30)),
        educations=(list[ExtractedEducation], Field(default_factory=list, max_length=15)),
    )


class ResumeReaderAgent:
    def __init__(self, provider: BaseLlmProvider, model_name: str | None):
        self.provider = provider
        self.model_name = model_name

    def read(self, resume_text: str, fields: list[CatalogField]) -> tuple[dict[str, str], list[ExtractedExperience], list[ExtractedEducation]]:
        response_model = _extraction_model(fields)
        prompt = build_resume_extraction_prompt(resume_text, fields)
        result = generate_validated_json(self.provider, self.model_name, prompt, response_model)
        values = {
            key: str(value).strip()
            for key, value in result.fields.model_dump().items()  # type: ignore[attr-defined]
            if value is not None and str(value).strip()
        }
        return values, result.experiences, result.educations  # type: ignore[attr-defined]
