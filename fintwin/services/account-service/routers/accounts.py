import os
import json
import redis
from fastapi import APIRouter, Depends, HTTPException, Header
from typing import Optional
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from database import get_db
from models import Account
from schemas import AccountOut, BalanceUpdate, AccountCreate

router = APIRouter(prefix="/accounts", tags=["accounts"])

# Redis connection
REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379")
INTERNAL_KEY = os.getenv("INTERNAL_KEY", "fintwin-internal-2024")

try:
    r = redis.from_url(REDIS_URL, decode_responses=True)
    r.ping()
except Exception:
    r = None

CACHE_TTL = 30  # 30 seconds

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/google", auto_error=False)


def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    """Validate session token against Redis and return the Account object."""
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    if not r:
        raise HTTPException(status_code=503, detail="Auth service unavailable")
    session_data = r.get(f"session:{token}")
    if not session_data:
        raise HTTPException(status_code=401, detail="Session expired or invalid")
    parts = session_data.split("|")
    account_id = parts[0]
    account = db.query(Account).filter(Account.id == account_id).first()
    if account is None:
        raise HTTPException(status_code=401, detail="User not found")
    return account


@router.get("/", response_model=list[AccountOut])
def list_accounts(db: Session = Depends(get_db), current_user: Account = Depends(get_current_user)):
    from sqlalchemy import or_
    return db.query(Account).filter(
        or_(Account.id == current_user.id, Account.email == current_user.email, Account.email.like(f"acc-%@fintwin.local"))
    ).all()


@router.post("/", response_model=AccountOut)
def create_account(req: AccountCreate, db: Session = Depends(get_db), current_user: Account = Depends(get_current_user)):
    """Create a new sub-account for the authenticated user."""
    import string, random
    chars = string.ascii_uppercase + string.digits
    new_id = "ACC-" + "".join(random.choices(chars, k=6))
    account = Account(
        id=new_id,
        name=req.name,
        email=current_user.email,
        picture=current_user.picture,
        type=req.type,
        balance=req.balance,
    )
    try:
        db.add(account)
        db.commit()
        db.refresh(account)
    except Exception:
        db.rollback()
        # Email unique constraint — use a generated email
        account.email = f"{new_id.lower()}@fintwin.local"
        db.add(account)
        db.commit()
        db.refresh(account)
    return account


@router.get("/{account_id}/exists")
def check_account_exists(account_id: str, db: Session = Depends(get_db)):
    account = db.query(Account).filter(Account.id == account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    return {"exists": True}


@router.get("/{account_id}", response_model=AccountOut)
def get_account(account_id: str, db: Session = Depends(get_db), current_user: Account = Depends(get_current_user)):
    if account_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    # Try cache first
    cache_key = f"account:{account_id}"
    try:
        if r:
            cached = r.get(cache_key)
            if cached:
                return json.loads(cached)
    except Exception:
        pass

    account = db.query(Account).filter(Account.id == account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    account_data = {
        "id": account.id,
        "name": account.name,
        "email": account.email,
        "picture": account.picture,
        "type": account.type,
        "balance": account.balance,
        "created_at": account.created_at.isoformat() if account.created_at else None,
    }

    # Store in cache
    try:
        if r:
            r.setex(cache_key, CACHE_TTL, json.dumps(account_data))
    except Exception:
        pass

    return account_data


@router.put("/{account_id}/balance")
def update_balance(account_id: str, req: BalanceUpdate, db: Session = Depends(get_db)):
    account = db.query(Account).filter(Account.id == account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    account.balance += req.delta
    db.commit()
    db.refresh(account)

    # Invalidate cache
    try:
        if r:
            r.delete(f"account:{account_id}")
    except Exception:
        pass

    return {"id": account.id, "balance": account.balance}


@router.get("/internal/accounts/{account_id}", response_model=AccountOut)
def get_account_internal(account_id: str, x_internal_key: Optional[str] = Header(None), db: Session = Depends(get_db)):
    if not x_internal_key or x_internal_key != INTERNAL_KEY:
        raise HTTPException(status_code=403, detail="Invalid or missing internal key")
    account = db.query(Account).filter(Account.id == account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    return {
        "id": account.id,
        "name": account.name,
        "email": account.email,
        "picture": account.picture,
        "type": account.type,
        "balance": account.balance,
        "created_at": account.created_at.isoformat() if account.created_at else None,
    }


@router.get("/internal/accounts/by-email", response_model=AccountOut)
def get_account_by_email(email: str, x_internal_key: Optional[str] = Header(None), db: Session = Depends(get_db)):
    if not x_internal_key or x_internal_key != INTERNAL_KEY:
        raise HTTPException(status_code=403, detail="Invalid or missing internal key")
    account = db.query(Account).filter(Account.email == email).first()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found for email")
    return {
        "id": account.id,
        "name": account.name,
        "email": account.email,
        "picture": account.picture,
        "type": account.type,
        "balance": account.balance,
        "created_at": account.created_at.isoformat() if account.created_at else None,
    }
