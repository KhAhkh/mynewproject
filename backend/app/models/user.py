from datetime import datetime
from typing import Optional

from sqlalchemy import Column, String, UniqueConstraint
from sqlmodel import Field, SQLModel

from ..utils.time import utcnow


class User(SQLModel, table=True):
    __tablename__ = "users"

    id: Optional[int] = Field(default=None, primary_key=True)
    username: str = Field(
        sa_column=Column("username", String(100), unique=True, nullable=False, index=True)
    )
    password_hash: str = Field(sa_column=Column("password_hash", String(255), nullable=False))
    role: str = Field(default="salesman", nullable=False, index=True)
    is_active: bool = Field(default=True, nullable=False, index=True)
    salesman_id: Optional[int] = Field(default=None, index=True)
    created_at: datetime = Field(default_factory=utcnow, nullable=False)
    updated_at: datetime = Field(default_factory=utcnow, nullable=False)


class RefreshToken(SQLModel, table=True):
    __tablename__ = "refresh_tokens"
    __table_args__ = (UniqueConstraint("user_id", "device_id", name="uq_refresh_device"),)

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", index=True, nullable=False)
    device_id: str = Field(nullable=False, index=True)
    token_hash: str = Field(nullable=False, index=True)
    created_at: datetime = Field(default_factory=utcnow, nullable=False)
    expires_at: datetime = Field(nullable=False, index=True)
