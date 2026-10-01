"""Dates chosen by the user, stored as naive UTC.

Every timestamp in this app is stored naive-UTC, and the ledger/dashboard date
filters already convert local days to UTC bounds using the browser's
`getTimezoneOffset()`. So the forms send a real instant — the browser builds one
from the picked local date and time and serialises it with `toISOString()` —
and this module strips it back to naive UTC on the way in.

Doing the conversion in the browser rather than passing an offset around keeps
one rule in one place: what the user picked on their clock is what they see
again on every screen and every report.
"""
from datetime import datetime, timezone


def to_naive_utc(dt: datetime | None, default: datetime | None = None) -> datetime | None:
    """Timezone-aware (or naive) datetime -> naive UTC, falling back to `default`."""
    if dt is None:
        return default
    if dt.tzinfo is not None:
        return dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt  # already naive — trust it as UTC, which is what the DB holds
