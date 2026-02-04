from functools import lru_cache
from pathlib import Path
from typing import Any

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_name: str = "Inventory Auth Service"
    api_v1_prefix: str = "/api"

    # security
    jwt_secret_key: str = "change-me"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 7

    # persistence
    database_url: str = f"sqlite:///{(Path(__file__).resolve().parents[2] / 'data' / 'app.db').as_posix()}"

    # admin bootstrap
    admin_username: str = "admin"
    admin_password: str = "Admin123!"

    class Config:
        env_file = Path(__file__).resolve().parents[2] / ".env"
        env_file_encoding = "utf-8"


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[arg-type]
