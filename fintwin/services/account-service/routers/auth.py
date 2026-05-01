import os
import uuid
import string
import random
import redis
import requests
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from database import get_db
from models import Account
from schemas import SessionResponse

router = APIRouter(prefix="/auth", tags=["auth"])

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")
GOOGLE_REDIRECT_URI = os.getenv("GOOGLE_REDIRECT_URI", "http://localhost/api/auth/google/callback")
REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379")
SESSION_TTL = int(os.getenv("SESSION_TTL", "86400"))  # 24h default
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")

# Redis connection
try:
    r = redis.from_url(REDIS_URL, decode_responses=True)
    r.ping()
except Exception:
    r = None


def generate_account_id():
    chars = string.ascii_uppercase + string.digits
    return "ACC-" + "".join(random.choices(chars, k=6))


def generate_session_token():
    return "ft_" + uuid.uuid4().hex + uuid.uuid4().hex


def store_session(account_id: str, name: str, email: str, picture: str = None):
    """Store session in Redis, returns the opaque token."""
    token = generate_session_token()
    session_data = f"{account_id}|{name}|{email}|{picture or ''}"
    if r:
        r.setex(f"session:{token}", SESSION_TTL, session_data)
    return token


@router.get("/google")
def google_login():
    """Redirect user to Google's OAuth 2.0 consent page."""
    scope = "openid email profile"
    params = (
        f"client_id={GOOGLE_CLIENT_ID}"
        f"&redirect_uri={GOOGLE_REDIRECT_URI}"
        f"&response_type=code"
        f"&scope={scope}"
        f"&access_type=offline"
    )
    return RedirectResponse(
        url=f"https://accounts.google.com/o/oauth2/v2/auth?{params}"
    )


@router.get("/google/callback")
def google_callback(code: str, db: Session = Depends(get_db)):
    """Handle Google OAuth callback, issue session token."""
    # Exchange code for tokens
    token_res = requests.post(
        "https://oauth2.googleapis.com/token",
        data={
            "code": code,
            "client_id": GOOGLE_CLIENT_ID,
            "client_secret": GOOGLE_CLIENT_SECRET,
            "redirect_uri": GOOGLE_REDIRECT_URI,
            "grant_type": "authorization_code",
        },
        timeout=10,
    )
    if token_res.status_code != 200:
        raise HTTPException(status_code=400, detail="Failed to exchange code with Google")

    tokens = token_res.json()
    access_token = tokens.get("access_token")

    # Fetch user info from Google
    userinfo_res = requests.get(
        "https://www.googleapis.com/oauth2/v2/userinfo",
        headers={"Authorization": f"Bearer {access_token}"},
        timeout=10,
    )
    if userinfo_res.status_code != 200:
        raise HTTPException(status_code=400, detail="Failed to fetch user info from Google")

    userinfo = userinfo_res.json()
    email = userinfo.get("email")
    name = userinfo.get("name", email)
    picture = userinfo.get("picture")

    if not email:
        raise HTTPException(status_code=400, detail="No email returned from Google")

    # Upsert user in DB
    account = db.query(Account).filter(Account.email == email).first()
    if not account:
        account = Account(
            id=generate_account_id(),
            name=name,
            email=email,
            picture=picture,
            type="savings",
            balance=0.0,
        )
        db.add(account)
        db.commit()
        db.refresh(account)
    else:
        # Update picture if changed
        if picture and account.picture != picture:
            account.picture = picture
            db.commit()

    # Issue session token stored in Redis
    session_token = store_session(account.id, account.name, account.email, account.picture)

    # Redirect frontend with token as query param (frontend stores in sessionStorage)
    callback_url = f"{FRONTEND_URL}/?token={session_token}&name={account.name}&id={account.id}&email={account.email}"
    return RedirectResponse(url=callback_url)


@router.post("/logout")
def logout(token: str, db: Session = Depends(get_db)):
    """Invalidate session token in Redis."""
    if r:
        r.delete(f"session:{token}")
    return {"message": "Logged out successfully"}
