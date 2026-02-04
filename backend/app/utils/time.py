from datetime import datetime, timezone


def utcnow() -> datetime:
    """Return timezone-aware UTC timestamp without microseconds."""
    return datetime.now(timezone.utc).replace(microsecond=0)
