from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class AccountOut(BaseModel):
    id: str
    name: str
    email: str
    picture: Optional[str] = None
    type: str
    balance: float
    created_at: datetime

    class Config:
        from_attributes = True


class SessionResponse(BaseModel):
    token: str
    user: dict


class BalanceUpdate(BaseModel):
    delta: float
