"""Timestamps are stored and sent as UTC; the browser shows them in the user's local time.

SQLite drops time zones, so a stored `11:37 UTC` comes back as a naive `11:37`. Sent
like that, a browser reads it as *local* time and shows the wrong clock. Everything
here makes sure a timestamp always carries its UTC offset (`…+00:00`).
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated

from pydantic import AfterValidator


def as_utc(moment: datetime) -> datetime:
    """Naive datetimes in this app are UTC; aware ones are converted to UTC."""
    return moment.replace(tzinfo=timezone.utc) if moment.tzinfo is None else moment.astimezone(timezone.utc)


# Pydantic field type: serializes as ISO-8601 with "+00:00", even for old rows saved without it.
UtcDatetime = Annotated[datetime, AfterValidator(as_utc)]
