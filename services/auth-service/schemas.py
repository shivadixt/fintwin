from pydantic import BaseModel
from typing import Optional, List
from enum import Enum


class CurrencyPreference(str, Enum):
    USD = "USD"
    EUR = "EUR"
    INR = "INR"
    GBP = "GBP"


class FinancialGoal(str, Enum):
    savings = "savings"
    investment = "investment"
    debt_payoff = "debt_payoff"
    wealth_building = "wealth_building"


class RiskAppetite(str, Enum):
    low = "low"
    medium = "medium"
    high = "high"


class GoogleAuthRequest(BaseModel):
    credential: str


class AuthResponse(BaseModel):
    ft_token: str
    user: dict


class UserOut(BaseModel):
    id: str
    email: str
    full_name: Optional[str] = None
    picture: Optional[str] = None
    account_name: Optional[str] = None
    phone_number: Optional[str] = None
    currency_preference: Optional[str] = None
    monthly_income: Optional[float] = None
    financial_goal: Optional[str] = None
    risk_appetite: Optional[str] = None
    is_profile_complete: bool = False

    class Config:
        from_attributes = True


class ProfileUpdate(BaseModel):
    account_name: str
    phone_number: str
    currency_preference: CurrencyPreference
    monthly_income: float
    financial_goal: FinancialGoal
    risk_appetite: RiskAppetite


class ProfileCompleteOut(BaseModel):
    is_profile_complete: bool


class PersonaTip(BaseModel):
    icon: str
    text: str


class PersonaScoreOut(BaseModel):
    label: str
    emoji: str
    score: int
    tips: List[PersonaTip]
