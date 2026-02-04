from typing import Optional

from pydantic import BaseModel, Field


class UserPublic(BaseModel):
    id: int
    username: str
    role: str
    salesman_id: Optional[int]

    class Config:
        from_attributes = True


class SalesmanRegisterRequest(BaseModel):
    username: str = Field(min_length=3, max_length=100)
    password: str = Field(min_length=6, max_length=128)
    salesman_id: Optional[int] = None
