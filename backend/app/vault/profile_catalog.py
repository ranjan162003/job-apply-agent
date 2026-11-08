"""Loads `profile_catalog.yaml`: the sections and fields the profile vault knows about."""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path

import yaml

from app.schemas.profile_schemas import CatalogField, CatalogSection

CATALOG_PATH = Path(__file__).with_name("profile_catalog.yaml")


@lru_cache
def load_catalog() -> tuple[CatalogSection, ...]:
    raw = yaml.safe_load(CATALOG_PATH.read_text(encoding="utf-8"))
    sections = tuple(CatalogSection.model_validate(section) for section in raw["sections"])
    keys = [field.key for section in sections for field in section.fields]
    duplicates = {key for key in keys if keys.count(key) > 1}
    if duplicates:
        raise ValueError(f"Duplicate profile keys in {CATALOG_PATH.name}: {sorted(duplicates)}")
    return sections


@lru_cache
def fields_by_key() -> dict[str, CatalogField]:
    return {field.key: field for section in load_catalog() for field in section.fields}
