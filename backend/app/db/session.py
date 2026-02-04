from collections.abc import Generator
from pathlib import Path

from sqlmodel import Session, SQLModel, create_engine

from ..core.config import get_settings


def _ensure_sqlite_directory(database_url: str) -> None:
    if not database_url.startswith("sqlite"):
        return
    if database_url.startswith("sqlite+pysqlite"):
        prefix = "sqlite+pysqlite:///"
    else:
        prefix = "sqlite:///"
    if not database_url.startswith(prefix):
        return
    raw_path = database_url[len(prefix) :]
    db_path = Path(raw_path)
    db_path.parent.mkdir(parents=True, exist_ok=True)


settings = get_settings()
_ensure_sqlite_directory(settings.database_url)

engine = create_engine(
    settings.database_url,
    connect_args={"check_same_thread": False} if settings.database_url.startswith("sqlite") else {},
    pool_pre_ping=True,
)


def init_db() -> None:
    from ..models import user  # noqa: F401  (ensure model import)

    SQLModel.metadata.create_all(bind=engine)


def get_session() -> Generator[Session, None, None]:
    with Session(engine) as session:
        yield session
