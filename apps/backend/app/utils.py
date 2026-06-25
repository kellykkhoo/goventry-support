from datetime import datetime, timezone


def utciso(dt: datetime | None) -> str | None:
    """Serialize a datetime to ISO 8601 with explicit UTC offset.

    DB columns without timezone=True are read back as naive datetimes even
    though they were stored as UTC. Without a UTC suffix, JavaScript treats
    the string as local time and shifts it by the browser's UTC offset (+8h
    for SGT), making all timestamps appear 8 hours wrong.
    """
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()
