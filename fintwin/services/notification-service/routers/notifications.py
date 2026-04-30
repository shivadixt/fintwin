import os
import uuid
import redis as redis_lib
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Header, WebSocket, WebSocketDisconnect
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from database import get_db
from models import Notification
from schemas import NotificationCreate, NotificationOut, NotificationCount

router = APIRouter(prefix="/notifications", tags=["notifications"])

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


class ConnectionManager:
    def __init__(self):
        self.active_connections: dict[str, list[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, account_id: str):
        await websocket.accept()
        if account_id not in self.active_connections:
            self.active_connections[account_id] = []
        self.active_connections[account_id].append(websocket)

    def disconnect(self, websocket: WebSocket, account_id: str):
        if account_id in self.active_connections:
            self.active_connections[account_id].remove(websocket)
            if not self.active_connections[account_id]:
                del self.active_connections[account_id]

    async def broadcast_to_user(self, account_id: str, message: dict):
        if account_id in self.active_connections:
            for connection in self.active_connections[account_id]:
                try:
                    await connection.send_json(message)
                except Exception:
                    pass


manager = ConnectionManager()


@router.get("/{account_id}", response_model=list[NotificationOut])
def get_notifications(account_id: str, type: Optional[str] = None, unread_only: Optional[bool] = None, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    if account_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    query = db.query(Notification).filter(Notification.account_id == account_id)
    if type:
        query = query.filter(Notification.type == type)
    if unread_only:
        query = query.filter(Notification.is_read == False)
    return query.order_by(Notification.created_at.desc()).all()


@router.get("/count/{account_id}")
def get_notification_count(account_id: str, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    if account_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    total = db.query(Notification).filter(Notification.account_id == account_id).count()
    unread = db.query(Notification).filter(Notification.account_id == account_id, Notification.is_read == False).count()
    return {"total": total, "unread": unread}


@router.post("/", response_model=NotificationOut)
async def create_notification(req: NotificationCreate, db: Session = Depends(get_db), x_internal_key: Optional[str] = Header(None)):
    if not x_internal_key or x_internal_key != INTERNAL_KEY:
        raise HTTPException(status_code=403, detail="Invalid or missing internal key")
    notification = Notification(id=str(uuid.uuid4()), account_id=req.account_id, title=req.title, message=req.message, type=req.type)
    db.add(notification)
    db.commit()
    db.refresh(notification)
    notif_data = {"id": notification.id, "account_id": notification.account_id, "title": notification.title, "message": notification.message, "type": notification.type, "is_read": notification.is_read, "created_at": notification.created_at.isoformat() if notification.created_at else None}
    await manager.broadcast_to_user(req.account_id, notif_data)
    return notification


@router.put("/read/{notification_id}", response_model=NotificationOut)
def mark_read(notification_id: str, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    notification = db.query(Notification).filter(Notification.id == notification_id).first()
    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")
    if notification.account_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    notification.is_read = True
    db.commit()
    db.refresh(notification)
    return notification


@router.put("/read-all/{account_id}")
def mark_all_read(account_id: str, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    if account_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    count = db.query(Notification).filter(Notification.account_id == account_id, Notification.is_read == False).update({"is_read": True})
    db.commit()
    return {"message": "All notifications marked as read", "count": count}


@router.delete("/{notification_id}")
def delete_notification(notification_id: str, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    notification = db.query(Notification).filter(Notification.id == notification_id).first()
    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")
    if notification.account_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    db.delete(notification)
    db.commit()
    return {"message": "Notification deleted"}


@router.websocket("/ws/{token}")
async def websocket_endpoint(websocket: WebSocket, token: str):
    """WebSocket auth via session token in Redis."""
    if not r:
        await websocket.close(code=1008)
        return
    session_data = r.get(f"session:{token}")
    if not session_data:
        await websocket.close(code=1008)
        return
    account_id = session_data.split("|")[0]
    await manager.connect(websocket, account_id)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket, account_id)
