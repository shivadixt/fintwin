from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime


class RiskAnalyzeRequest(BaseModel):
    account_id: str
    current_balance: float
    recent_transactions: List[dict]


class RiskScoreOut(BaseModel):
    id: str
    account_id: str
    score: int
    alert_level: str
    flags: List[str]
    ml_details: Optional[Dict[str, Any]] = None
    updated_at: datetime
