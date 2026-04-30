from sqlalchemy import Column, String, Float, Boolean, DateTime, Enum as SAEnum
from sqlalchemy.sql import func
from database import Base
import enum


class CurrencyPreference(str, enum.Enum):
    USD = "USD"
    EUR = "EUR"
    INR = "INR"
    GBP = "GBP"


class FinancialGoal(str, enum.Enum):
    savings = "savings"
    investment = "investment"
    debt_payoff = "debt_payoff"
    wealth_building = "wealth_building"


class RiskAppetite(str, enum.Enum):
    low = "low"
    medium = "medium"
    high = "high"


class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True)
    email = Column(String, unique=True, nullable=False, index=True)
    full_name = Column(String, nullable=True)
    picture = Column(String, nullable=True)
    account_name = Column(String, nullable=True)
    phone_number = Column(String, nullable=True)
    currency_preference = Column(String, nullable=True)
    monthly_income = Column(Float, nullable=True)
    financial_goal = Column(String, nullable=True)
    risk_appetite = Column(String, nullable=True)
    is_profile_complete = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
