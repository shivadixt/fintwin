import os
import uuid
import redis as redis_lib
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Header
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from datetime import datetime

from database import get_db
from models import Holding
from schemas import HoldingCreate, HoldingUpdate, HoldingOut, PortfolioSummary

router = APIRouter(prefix="/portfolio", tags=["portfolio"])

INTERNAL_KEY = os.getenv("INTERNAL_KEY", "fintwin-internal-2024")
REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379")

try:
    r = redis_lib.from_url(REDIS_URL, decode_responses=True)
    r.ping()
except Exception:
    r = None

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/google", auto_error=False)


def get_current_user(token: str = Depends(oauth2_scheme)):
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    if not r:
        raise HTTPException(status_code=503, detail="Auth service unavailable")
    session_data = r.get(f"session:{token}")
    if not session_data:
        raise HTTPException(status_code=401, detail="Session expired or invalid")
    account_id = session_data.split("|")[0]
    return type("User", (), {"id": account_id})()


def holding_to_dict(h):
    current_value = h.quantity * h.current_price
    invested_value = h.quantity * h.buy_price
    gain_loss = current_value - invested_value
    gain_loss_pct = ((h.current_price - h.buy_price) / h.buy_price) * 100 if h.buy_price > 0 else 0.0
    return {
        "id": h.id, "account_id": h.account_id, "ticker": h.ticker, "company_name": h.company_name,
        "quantity": h.quantity, "buy_price": h.buy_price, "current_price": h.current_price,
        "current_value": round(current_value, 2), "invested_value": round(invested_value, 2),
        "gain_loss": round(gain_loss, 2), "gain_loss_pct": round(gain_loss_pct, 2),
        "created_at": h.created_at.isoformat() if h.created_at else None,
        "updated_at": h.updated_at.isoformat() if h.updated_at else None,
    }


@router.get("/holdings/{account_id}")
def get_holdings(account_id: str, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    if account_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    holdings = db.query(Holding).filter(Holding.account_id == account_id).all()
    return [holding_to_dict(h) for h in holdings]


@router.post("/holdings")
def create_holding(req: HoldingCreate, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    holding = Holding(id=str(uuid.uuid4()), account_id=current_user.id, ticker=req.ticker.upper(), company_name=req.company_name, quantity=req.quantity, buy_price=req.buy_price, current_price=req.current_price)
    db.add(holding)
    db.commit()
    db.refresh(holding)
    return holding_to_dict(holding)


@router.put("/holdings/{holding_id}")
def update_holding(holding_id: str, req: HoldingUpdate, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    holding = db.query(Holding).filter(Holding.id == holding_id).first()
    if not holding:
        raise HTTPException(status_code=404, detail="Holding not found")
    if holding.account_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    holding.current_price = req.current_price
    holding.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(holding)
    return holding_to_dict(holding)


@router.delete("/holdings/{holding_id}")
def delete_holding(holding_id: str, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    holding = db.query(Holding).filter(Holding.id == holding_id).first()
    if not holding:
        raise HTTPException(status_code=404, detail="Holding not found")
    if holding.account_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    db.delete(holding)
    db.commit()
    return {"message": "Holding removed successfully"}


@router.get("/summary/{account_id}")
def get_summary(account_id: str, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    if account_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    holdings = db.query(Holding).filter(Holding.account_id == account_id).all()
    if not holdings:
        return PortfolioSummary(total_portfolio_value=0.0, total_invested=0.0, total_gain_loss=0.0, total_return_pct=0.0, total_holdings=0, best_performer=None, worst_performer=None)
    total_portfolio_value = sum(h.quantity * h.current_price for h in holdings)
    total_invested = sum(h.quantity * h.buy_price for h in holdings)
    total_gain_loss = total_portfolio_value - total_invested
    total_return_pct = ((total_portfolio_value - total_invested) / total_invested) * 100 if total_invested > 0 else 0.0
    performances = [{"ticker": h.ticker, "gain_loss_pct": round(((h.current_price - h.buy_price) / h.buy_price) * 100 if h.buy_price > 0 else 0.0, 2)} for h in holdings]
    performances.sort(key=lambda x: x["gain_loss_pct"])
    return PortfolioSummary(total_portfolio_value=round(total_portfolio_value, 2), total_invested=round(total_invested, 2), total_gain_loss=round(total_gain_loss, 2), total_return_pct=round(total_return_pct, 2), total_holdings=len(holdings), best_performer=performances[-1], worst_performer=performances[0])


from pydantic import BaseModel
class InternalRefreshReq(BaseModel):
    account_id: str

@router.post("/internal/portfolio/refresh")
def internal_portfolio_refresh(req: InternalRefreshReq, x_internal_key: Optional[str] = Header(None), db: Session = Depends(get_db)):
    if not x_internal_key or x_internal_key != INTERNAL_KEY:
        raise HTTPException(status_code=403, detail="Invalid internal key")
    return {"status": "Portfolio refresh queued successfully"}
