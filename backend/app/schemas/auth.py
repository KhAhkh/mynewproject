from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field

from .user import UserPublic


class LoginRequest(BaseModel):
    username: str
    password: str
    device_id: str = Field(min_length=3)


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    access_expires_in: int
    refresh_expires_in: int


class LoginResponse(BaseModel):
    tokens: TokenPair
    user: UserPublic


class RefreshRequest(BaseModel):
    refresh_token: str
    device_id: str


class RefreshResponse(BaseModel):
    tokens: TokenPair


class TokenPayload(BaseModel):
    sub: str
    type: str
    username: str
    role: str
    salesman_id: Optional[int] = None
    device_id: Optional[str] = None
    exp: int
    iat: int


class LogoutRequest(BaseModel):
    refresh_token: str
    device_id: str
