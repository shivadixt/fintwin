import os
from datetime import datetime, timedelta, timezone
from jose import jwt, JWTError
from fastapi import Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer

JWT_SECRET = os.getenv("JWT_SECRET", "fintwin-super-secret-key-2024")
JWT_ALGORITHM = "HS256"
JWT_EXPIRY_HOURS = 24

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/google")


def create_token(user_id: str, name: str = "", email: str = "") -> str:
    """Generate a signed internal JWT (ft_token) with user id as sub claim."""
    payload = {
        "sub": user_id,
        "name": name,
        "email": email,
        "iat": datetime.now(timezone.utc),
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRY_HOURS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def verify_token(token: str) -> dict:
    """Verify and decode an ft_token. Returns the payload dict."""
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("sub") is None:
            raise HTTPException(status_code=401, detail="Invalid token: no sub claim")
        return payload
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")


def get_current_user_id(token: str = Depends(oauth2_scheme)) -> str:
    """FastAPI dependency to extract the current user ID from the JWT."""
    payload = verify_token(token)
    return payload["sub"]
