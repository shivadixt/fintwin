import os
import uuid
import httpx
import redis as redis_lib
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Request, Header
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from schemas import SimulationRequest, SimulationResult, ChatRequest, ChatResponse
from engine import run_simulation
from database import get_db
from models import Simulation
from ai_agent import generate_financial_advice

router = APIRouter(prefix="/simulate", tags=["simulate"])
PORTFOLIO_SERVICE_URL = os.getenv("PORTFOLIO_SERVICE_URL", "http://portfolio-service:8005")
ACCOUNT_SERVICE_URL = os.getenv("ACCOUNT_SERVICE_URL", "http://account-service:8001")
NOTIFICATION_SERVICE_URL = os.getenv("NOTIFICATION_SERVICE_URL", "http://notification-service:8006")
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
    return session_data.split("|")[0]


@router.post("/", response_model=SimulationResult)
async def simulate(req: SimulationRequest, request: Request, db: Session = Depends(get_db), current_user_id: str = Depends(get_current_user)):
    if req.account_id != current_user_id:
        raise HTTPException(status_code=403, detail="Access denied")
    try:
        auth_header = request.headers.get("Authorization")
        result = await run_simulation(req, auth_header)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    sim = Simulation(id=str(uuid.uuid4()), account_id=current_user_id, scenario=req.scenario, amount=req.amount, before_balance=result.current_balance, after_balance=result.virtual_balance, risk_score=result.risk_score, alert_level=result.alert_level, recommendation=result.recommendation)
    db.add(sim)
    db.commit()
    try:
        if result.alert_level in ("medium", "high"):
            notif_type = "risk" if result.alert_level == "high" else "alert"
            async with httpx.AsyncClient() as client:
                await client.post(f"{NOTIFICATION_SERVICE_URL}/notifications/", json={"account_id": current_user_id, "title": "Simulation completed", "message": f"Your {req.scenario} simulation returned risk score {result.risk_score}", "type": notif_type}, headers={"X-Internal-Key": INTERNAL_KEY}, timeout=5.0)
    except Exception:
        pass
    return result


@router.get("/history/{account_id}")
def get_simulation_history(account_id: str, db: Session = Depends(get_db), current_user_id: str = Depends(get_current_user)):
    if account_id != current_user_id:
        raise HTTPException(status_code=403, detail="Access denied")
    simulations = db.query(Simulation).filter(Simulation.account_id == account_id).order_by(Simulation.created_at.desc()).limit(10).all()
    return [{"id": s.id, "account_id": s.account_id, "scenario": s.scenario, "amount": s.amount, "before_balance": s.before_balance, "after_balance": s.after_balance, "risk_score": s.risk_score, "alert_level": s.alert_level, "recommendation": s.recommendation, "created_at": s.created_at.isoformat() if s.created_at else None} for s in simulations]


@router.get("/history/detail/{simulation_id}")
def get_simulation_detail(simulation_id: str, db: Session = Depends(get_db), current_user_id: str = Depends(get_current_user)):
    sim = db.query(Simulation).filter(Simulation.id == simulation_id).first()
    if not sim:
        raise HTTPException(status_code=404, detail="Simulation not found")
    if sim.account_id != current_user_id:
        raise HTTPException(status_code=403, detail="Access denied")
    return {"id": sim.id, "account_id": sim.account_id, "scenario": sim.scenario, "amount": sim.amount, "before_balance": sim.before_balance, "after_balance": sim.after_balance, "risk_score": sim.risk_score, "alert_level": sim.alert_level, "recommendation": sim.recommendation, "created_at": sim.created_at.isoformat() if sim.created_at else None}


@router.delete("/history/{account_id}")
def clear_simulation_history(account_id: str, db: Session = Depends(get_db), current_user_id: str = Depends(get_current_user)):
    if account_id != current_user_id:
        raise HTTPException(status_code=403, detail="Access denied")
    deleted_count = db.query(Simulation).filter(Simulation.account_id == account_id).delete()
    db.commit()
    return {"message": "Simulation history cleared", "deleted_count": deleted_count}


@router.delete("/history/detail/{simulation_id}")
def delete_single_simulation(simulation_id: str, db: Session = Depends(get_db), current_user_id: str = Depends(get_current_user)):
    sim = db.query(Simulation).filter(Simulation.id == simulation_id).first()
    if not sim:
        raise HTTPException(status_code=404, detail="Simulation not found")
    if sim.account_id != current_user_id:
        raise HTTPException(status_code=403, detail="Access denied")
    db.delete(sim)
    db.commit()
    return {"message": "Simulation deleted"}


@router.post("/chat", response_model=ChatResponse)
async def ai_chat(req: ChatRequest, request: Request, db: Session = Depends(get_db), current_user_id: str = Depends(get_current_user)):
    if req.account_id != current_user_id:
        raise HTTPException(status_code=403, detail="Access denied")
    auth_header = request.headers.get("Authorization")
    headers = {"Authorization": auth_header} if auth_header else {}
    async with httpx.AsyncClient() as client:
        acc_resp = await client.get(f"{ACCOUNT_SERVICE_URL}/accounts/{req.account_id}", headers=headers)
        current_balance = acc_resp.json().get("balance", 0.0) if acc_resp.status_code == 200 else 0.0
        port_resp = await client.get(f"{PORTFOLIO_SERVICE_URL}/portfolio/summary/{req.account_id}", headers=headers)
        portfolio_summary = port_resp.json() if port_resp.status_code == 200 else {}
    reply = generate_financial_advice(req.message, current_balance, portfolio_summary)
    return ChatResponse(response=reply)


from pydantic import BaseModel
class InternalRefreshReq(BaseModel):
    account_id: str

@router.post("/internal/twin/refresh")
async def internal_twin_refresh(req: InternalRefreshReq, x_internal_key: Optional[str] = Header(None)):
    if not x_internal_key or x_internal_key != INTERNAL_KEY:
        raise HTTPException(status_code=403, detail="Invalid internal key")
    try:
        async with httpx.AsyncClient() as client:
            await client.post(f"{NOTIFICATION_SERVICE_URL}/notifications/", json={"account_id": req.account_id, "title": "Twin Engine Synced", "message": "Your digital twin has been successfully synchronized with latest transactions.", "type": "info"}, headers={"X-Internal-Key": INTERNAL_KEY}, timeout=5.0)
    except Exception:
        pass
    return {"status": "Twin synced successfully"}
