"""Database tables. Everything stays in a local SQLite file under `backend/data/`."""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database_session import OrmBase


def _now() -> datetime:
    return datetime.now(timezone.utc)


class ProfileValue(OrmBase):
    """One answer in the vault, keyed by a field from `profile_catalog.yaml`."""

    __tablename__ = "profile_values"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    value: Mapped[str] = mapped_column(Text)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_now, onupdate=_now)


class Experience(OrmBase):
    """A job on your resume. Workday-style forms ask for each one separately."""

    __tablename__ = "experiences"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    position: Mapped[int] = mapped_column(Integer, default=0)
    title: Mapped[str] = mapped_column(String(200))
    company: Mapped[str] = mapped_column(String(200))
    location: Mapped[str] = mapped_column(String(200), default="")
    start_date: Mapped[str] = mapped_column(String(7), default="")  # YYYY-MM
    end_date: Mapped[str] = mapped_column(String(7), default="")  # YYYY-MM, empty while current
    is_current: Mapped[bool] = mapped_column(Boolean, default=False)
    description: Mapped[str] = mapped_column(Text, default="")


class Education(OrmBase):
    __tablename__ = "educations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    position: Mapped[int] = mapped_column(Integer, default=0)
    school: Mapped[str] = mapped_column(String(200))
    degree: Mapped[str] = mapped_column(String(200), default="")
    field_of_study: Mapped[str] = mapped_column(String(200), default="")
    start_year: Mapped[str] = mapped_column(String(4), default="")
    end_year: Mapped[str] = mapped_column(String(4), default="")
    grade: Mapped[str] = mapped_column(String(50), default="")


class Resume(OrmBase):
    """An uploaded resume file plus its extracted text (used for import and AI drafting)."""

    __tablename__ = "resumes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    original_filename: Mapped[str] = mapped_column(String(255))
    stored_filename: Mapped[str] = mapped_column(String(80), unique=True)
    content_type: Mapped[str] = mapped_column(String(120))
    size_bytes: Mapped[int] = mapped_column(Integer)
    text: Mapped[str] = mapped_column(Text, default="")
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)


class AppSetting(OrmBase):
    """Small key/value settings, such as the extension pairing token's hash."""

    __tablename__ = "app_settings"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    value: Mapped[str] = mapped_column(Text)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_now, onupdate=_now)
