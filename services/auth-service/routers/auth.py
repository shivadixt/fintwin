import os
import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests

from database import get_db
from models import User
from schemas import (
    GoogleAuthRequest,
    AuthResponse,
    UserOut,
    ProfileUpdate,
    ProfileCompleteOut,
)
from jwt_utils import create_token, get_current_user_id

router = APIRouter(prefix="/auth", tags=["auth"])

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")


@router.post("/google", response_model=AuthResponse)
def google_login(req: GoogleAuthRequest, db: Session = Depends(get_db)):
    """Accept Google ID token, verify it, create or fetch user, return ft_token."""
    print(f"🔑 Verifying token with CLIENT_ID: '{GOOGLE_CLIENT_ID}'")
    try:
        idinfo = id_token.verify_oauth2_token(
            req.credential,
            google_requests.Request(),
            GOOGLE_CLIENT_ID,
            clock_skew_in_seconds=30,
        )
        print(f"✅ Token verified! Email: {idinfo.get('email')}")
    except ValueError as e:
        print(f"❌ Google token verification FAILED: {e}")
        raise HTTPException(status_code=401, detail=f"Invalid Google token: {str(e)}")

    email = idinfo.get("email")
    if not email:
        raise HTTPException(status_code=400, detail="Email not found in Google token")

    full_name = idinfo.get("name", "")
    picture = idinfo.get("picture", "")

    # Find or create user
    user = db.query(User).filter(User.email == email).first()
    if not user:
        user = User(
            id=str(uuid.uuid4()),
            email=email,
            full_name=full_name,
            picture=picture,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    else:
        # Update profile picture and name from Google on each login
        user.full_name = full_name
        user.picture = picture
        db.commit()
        db.refresh(user)

    token = create_token(user.id, name=user.full_name or "", email=user.email)

    return AuthResponse(
        ft_token=token,
        user={
            "id": user.id,
            "email": user.email,
            "full_name": user.full_name,
            "picture": user.picture,
            "is_profile_complete": user.is_profile_complete,
        },
    )


@router.get("/me", response_model=UserOut)
def get_me(
    current_user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Protected endpoint — return current user info from JWT."""
    user = db.query(User).filter(User.id == current_user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@router.put("/profile", response_model=UserOut)
def update_profile(
    profile: ProfileUpdate,
    current_user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Protected endpoint — save onboarding profile data."""
    user = db.query(User).filter(User.id == current_user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.account_name = profile.account_name
    user.phone_number = profile.phone_number
    user.currency_preference = profile.currency_preference.value
    user.monthly_income = profile.monthly_income
    user.financial_goal = profile.financial_goal.value
    user.risk_appetite = profile.risk_appetite.value
    user.is_profile_complete = True

    db.commit()
    db.refresh(user)
    return user


@router.get("/profile/complete", response_model=ProfileCompleteOut)
def check_profile_complete(
    current_user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Returns whether the user has completed their onboarding profile."""
    user = db.query(User).filter(User.id == current_user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return ProfileCompleteOut(is_profile_complete=user.is_profile_complete)
