import os
import uuid
import httpx
import redis as redis_lib
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Header, UploadFile, File
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from sqlalchemy import or_

from database import get_db
from models import Transaction, StatementUpload
from schemas import TransactionCreate, TransactionOut

router = APIRouter(prefix="/transactions", tags=["transactions"])

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
    """Validate Bearer token against Redis session store."""
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    if not r:
        raise HTTPException(status_code=503, detail="Auth service unavailable")
    session_data = r.get(f"session:{token}")
    if not session_data:
        raise HTTPException(status_code=401, detail="Session expired or invalid")
    parts = session_data.split("|")
    return parts[0]  # account_id


async def send_notification(account_id: str, title: str, message: str, notif_type: str):
    try:
        async with httpx.AsyncClient() as client:
            await client.post(
                f"{NOTIFICATION_SERVICE_URL}/notifications/",
                json={"account_id": account_id, "title": title, "message": message, "type": notif_type},
                headers={"X-Internal-Key": INTERNAL_KEY},
                timeout=5.0,
            )
    except Exception:
        pass


@router.post("/", response_model=TransactionOut)
async def create_transaction(req: TransactionCreate, db: Session = Depends(get_db), current_user_id: str = Depends(get_current_user)):
    if req.type in ("deposit", "withdrawal", "transfer"):
        account_id = current_user_id
    else:
        account_id = current_user_id

    if req.type == "transfer":
        if not req.to_account:
            raise HTTPException(status_code=400, detail="to_account is required for transfers")
        async with httpx.AsyncClient() as check_client:
            check_resp = await check_client.get(f"{ACCOUNT_SERVICE_URL}/accounts/{req.to_account}/exists")
            if check_resp.status_code != 200:
                raise HTTPException(status_code=404, detail="Destination account not found")

    txn = Transaction(
        id=str(uuid.uuid4()),
        account_id=account_id,
        type=req.type,
        amount=req.amount,
        to_account=req.to_account,
        note=req.note,
    )
    db.add(txn)
    db.commit()
    db.refresh(txn)

    async with httpx.AsyncClient() as client:
        if req.type == "deposit":
            resp = await client.put(f"{ACCOUNT_SERVICE_URL}/accounts/{account_id}/balance", json={"delta": req.amount})
            if resp.status_code != 200:
                raise HTTPException(status_code=500, detail="Failed to update account balance")
        elif req.type == "withdrawal":
            resp = await client.put(f"{ACCOUNT_SERVICE_URL}/accounts/{account_id}/balance", json={"delta": -req.amount})
            if resp.status_code != 200:
                raise HTTPException(status_code=500, detail="Failed to update account balance")
        elif req.type == "transfer":
            resp1 = await client.put(f"{ACCOUNT_SERVICE_URL}/accounts/{account_id}/balance", json={"delta": -req.amount})
            resp2 = await client.put(f"{ACCOUNT_SERVICE_URL}/accounts/{req.to_account}/balance", json={"delta": req.amount})
            if resp1.status_code != 200 or resp2.status_code != 200:
                raise HTTPException(status_code=500, detail="Failed to update account balances")

    if req.type == "deposit":
        await send_notification(account_id, "Deposit received", f"₹{req.amount:,.0f} deposited to your account", "info")
    elif req.type == "withdrawal":
        await send_notification(account_id, "Withdrawal processed", f"₹{req.amount:,.0f} withdrawn from your account", "alert")
    elif req.type == "transfer":
        await send_notification(account_id, "Transfer sent", f"₹{req.amount:,.0f} transferred successfully", "info")

    return txn


@router.get("/", response_model=list[TransactionOut])
def list_transactions(limit: int = 100, offset: int = 0, db: Session = Depends(get_db), current_user_id: str = Depends(get_current_user)):
    return (
        db.query(Transaction)
        .filter(or_(Transaction.account_id == current_user_id, Transaction.to_account == current_user_id))
        .order_by(Transaction.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )


@router.get("/account/{account_id}", response_model=list[TransactionOut])
def get_account_transactions(account_id: str, db: Session = Depends(get_db), current_user_id: str = Depends(get_current_user)):
    if account_id != current_user_id:
        raise HTTPException(status_code=403, detail="Access denied")
    return (
        db.query(Transaction)
        .filter(or_(Transaction.account_id == account_id, Transaction.to_account == account_id))
        .order_by(Transaction.created_at.desc())
        .all()
    )


# ─── Statement Upload ────────────────────────────────────────────────────────

@router.post("/statements/upload")
async def upload_statement(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user_id: str = Depends(get_current_user),
):
    """Accept PDF or CSV bank statements, parse transactions, bulk-insert them."""
    import io, pandas as pd

    filename = (file.filename or "").lower()
    
    if not (filename.endswith(".pdf") or filename.endswith(".csv")):
        raise HTTPException(status_code=400, detail="Only PDF and CSV files are accepted")

    content = await file.read()
    
    if len(content) == 0:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")

    extracted_rows = []

    if filename.endswith(".csv"):
        try:
            # Try different encodings and separators
            import io
            content_str = content.decode('utf-8', errors='ignore')
            sep = ','
            if ';' in content_str and ',' not in content_str: sep = ';'
            if '\t' in content_str: sep = '\t'
            
            df = pd.read_csv(io.StringIO(content_str), sep=sep)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Could not parse CSV: {str(e)}")

        # Normalize common column names
        col_map = {}
        # Clean BOM and non-printable characters from headers
        df.columns = [col.encode('ascii', 'ignore').decode('ascii').strip() if isinstance(col, str) else str(col) for col in df.columns]
        
        for col in df.columns:
            cl = str(col).lower()
            if any(x in cl for x in ["date", "dt"]): col_map[col] = "date"
            elif any(x in cl for x in ["desc", "narr", "particular", "remark", "details", "memo"]): col_map[col] = "description"
            elif any(x in cl for x in ["debit", "withdrawal", "withdraw", "dr amt", "out"]): col_map[col] = "debit"
            elif any(x in cl for x in ["credit", "deposit", "dep", "cr amt", "in"]): col_map[col] = "credit"
            elif any(x in cl for x in ["amount", "txn amt", "value"]): col_map[col] = "amount"
            elif "type" in cl: col_map[col] = "type"
            elif any(x in cl for x in ["balance", "bal", "closing"]): col_map[col] = "balance"
        
        # LAST RESORT: If no essential columns found, guess by position
        if not col_map or len(col_map) < 2:
            if len(df.columns) >= 3:
                col_map[df.columns[0]] = "date"
                # If 4+ columns, assume Date, Desc, Debit, Credit
                if len(df.columns) >= 4:
                    col_map[df.columns[1]] = "description"
                    col_map[df.columns[2]] = "debit"
                    col_map[df.columns[3]] = "credit"
                else:
                    col_map[df.columns[1]] = "description"
                    col_map[df.columns[2]] = "amount"

        df = df.rename(columns=col_map)

        for _, row in df.iterrows():
            def get_val(key):
                v = row.get(key, 0)
                if pd.isna(v) or v == "": return 0
                try:
                    # Handle ₹ symbol, commas, and other formatting
                    return float(str(v).replace("₹", "").replace(",", "").replace(" ", "").strip() or 0)
                except: return 0

            debit = get_val("debit")
            credit = get_val("credit")
            amount_val = get_val("amount")
            type_val = str(row.get("type", "")).lower()

            txn_type = "deposit"
            amount = 0.0

            if amount_val != 0:
                if amount_val > 0:
                    txn_type = "deposit"
                    amount = amount_val
                else:
                    txn_type = "withdrawal"
                    amount = abs(amount_val)
            elif debit != 0:
                txn_type = "withdrawal"
                amount = debit
            elif credit != 0:
                txn_type = "deposit"
                amount = credit
            elif "type" in df.columns:
                if any(x in type_val for x in ["dep", "cr", "in", "deposit"]):
                    txn_type = "deposit"
                else:
                    txn_type = "withdrawal"
                amount = abs(amount_val)
            else:
                continue

            note = str(row.get("description", "Imported transaction"))[:255]
            extracted_rows.append({"type": txn_type, "amount": amount, "note": note})

    elif filename.endswith(".pdf"):
        try:
            import pdfplumber
        except ImportError:
            raise HTTPException(status_code=500, detail="PDF parsing library not available")
        try:
            with pdfplumber.open(io.BytesIO(content)) as pdf:
                for i, page in enumerate(pdf.pages):
                    tables = page.extract_tables()
                    
                    if tables:
                        for t_idx, table in enumerate(tables):
                            if not table or len(table) < 1: continue
                            headers = [str(h or "").strip().lower() for h in table[0]]
                            
                            for row in table[1:]:
                                row_dict = dict(zip(headers, row))
                                
                                def find_val(keywords):
                                    for k, v in row_dict.items():
                                        if any(kw in str(k).lower() for kw in keywords):
                                            return v
                                    return "0"

                                debit_raw = find_val(["debit", "withdrawal", "dr", "out"])
                                credit_raw = find_val(["credit", "deposit", "cr", "in"])
                                
                                try:
                                    def clean_n(val):
                                        if val is None: return 0
                                        return float(str(val).replace("₹", "").replace(",", "").replace(" ", "").strip() or 0)
                                    debit = clean_n(debit_raw)
                                    credit = clean_n(credit_raw)
                                except Exception: continue
                                
                                if debit == 0 and credit == 0: continue
                                txn_type = "deposit" if credit > 0 else "withdrawal"
                                amount = credit if credit > 0 else debit
                                
                                note = "PDF Import"
                                for k, v in row_dict.items():
                                    kl = str(k).lower()
                                    if any(x in kl for x in ["desc", "narr", "particular", "detail", "remark"]):
                                        note = str(v or "PDF Import")[:255]
                                        break
                                
                                extracted_rows.append({"type": txn_type, "amount": amount, "note": note})
                    
                    # If no rows found in tables, try raw text parsing
                    if not extracted_rows:
                        text = page.extract_text()
                        if text:
                            lines = text.split("\n")
                            for line in lines:
                                # Look for lines with currency-like patterns
                                import re
                                # Pattern: Look for 2 or more numbers with decimals
                                amounts = re.findall(r"[\d,]+\.\d{2}", line)
                                if len(amounts) >= 2:
                                    try:
                                        # Usually: [Debit, Credit, Balance] or [Amount, Balance]
                                        # If we see 3 numbers, it's likely [Debit, Credit, Balance]
                                        def cn(v): return float(v.replace(",", ""))
                                        
                                        if len(amounts) >= 3:
                                            d = cn(amounts[0])
                                            c = cn(amounts[1])
                                            if d > 0 or c > 0:
                                                extracted_rows.append({
                                                    "type": "deposit" if c > 0 else "withdrawal",
                                                    "amount": c if c > 0 else d,
                                                    "note": line[:100]
                                                })
                                        elif len(amounts) == 2:
                                            # Likely [Amount, Balance]
                                            # Hard to tell if dep/with without a type word
                                            a = cn(amounts[0])
                                            extracted_rows.append({
                                                "type": "deposit" if a > 0 else "withdrawal",
                                                "amount": abs(a),
                                                "note": line[:100]
                                            })
                                    except: continue
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Could not parse PDF: {str(e)}")

    if not extracted_rows:
        raise HTTPException(status_code=422, detail="No transactions could be extracted from this file. Check the format.")

    # Bulk insert transactions
    txn_objects = []
    for row in extracted_rows:
        t = Transaction(
            id=str(uuid.uuid4()),
            account_id=current_user_id,
            type=row["type"],
            amount=row["amount"],
            note=row["note"],
        )
        txn_objects.append(t)

    db.add_all(txn_objects)

    # Calculate total balance impact
    total_delta = 0.0
    for txn in txn_objects:
        if txn.type == "deposit":
            total_delta += txn.amount
        else:
            total_delta -= txn.amount

    # Update account balance via account-service
    if total_delta != 0:
        try:
            async with httpx.AsyncClient() as client:
                await client.put(f"{ACCOUNT_SERVICE_URL}/accounts/{current_user_id}/balance", json={"delta": total_delta})
        except Exception as e:
            # We log but don't fail, as transactions are already in DB
            print(f"Failed to update balance after statement upload: {str(e)}")

    # Save upload record
    upload_record = StatementUpload(
        id=str(uuid.uuid4()),
        account_id=current_user_id,
        filename=filename,
        transaction_count=len(txn_objects),
    )
    db.add(upload_record)
    db.commit()

    preview = [{"type": r["type"], "amount": r["amount"], "note": r["note"]} for r in extracted_rows[:5]]
    return {
        "message": f"{len(txn_objects)} transactions extracted from {filename}",
        "transaction_count": len(txn_objects),
        "filename": filename,
        "upload_id": upload_record.id,
        "preview": preview,
    }


@router.get("/statements/history")
def get_statement_history(db: Session = Depends(get_db), current_user_id: str = Depends(get_current_user)):
    records = (
        db.query(StatementUpload)
        .filter(StatementUpload.account_id == current_user_id)
        .order_by(StatementUpload.uploaded_at.desc())
        .all()
    )
    return [
        {
            "id": r.id,
            "filename": r.filename,
            "transaction_count": r.transaction_count,
            "uploaded_at": r.uploaded_at.isoformat() if r.uploaded_at else None,
        }
        for r in records
    ]


@router.delete("/statements/{upload_id}")
def delete_statement(upload_id: str, db: Session = Depends(get_db), current_user_id: str = Depends(get_current_user)):
    record = db.query(StatementUpload).filter(StatementUpload.id == upload_id, StatementUpload.account_id == current_user_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Upload record not found")
    db.delete(record)
    db.commit()
    return {"message": "Statement and its associated upload record deleted"}


# ─── Internal endpoints ───────────────────────────────────────────────────────

@router.post("/internal/transactions", response_model=TransactionOut)
async def create_internal_transaction(req: TransactionCreate, x_internal_key: Optional[str] = Header(None), db: Session = Depends(get_db)):
    if not x_internal_key or x_internal_key != INTERNAL_KEY:
        raise HTTPException(status_code=403, detail="Invalid or missing internal key")
    account_id = req.account_id
    txn = Transaction(
        id=str(uuid.uuid4()),
        account_id=account_id,
        type=req.type,
        amount=req.amount,
        to_account=req.to_account,
        note=req.note,
    )
    db.add(txn)
    db.commit()
    db.refresh(txn)
    async with httpx.AsyncClient() as client:
        if req.type == "deposit":
            await client.put(f"{ACCOUNT_SERVICE_URL}/accounts/{account_id}/balance", json={"delta": req.amount})
        elif req.type == "withdrawal":
            await client.put(f"{ACCOUNT_SERVICE_URL}/accounts/{account_id}/balance", json={"delta": -req.amount})
    return txn


@router.get("/internal/transactions/account/{account_id}", response_model=list[TransactionOut])
def get_internal_account_transactions(account_id: str, x_internal_key: Optional[str] = Header(None), db: Session = Depends(get_db)):
    if not x_internal_key or x_internal_key != INTERNAL_KEY:
        raise HTTPException(status_code=403, detail="Invalid internal key")
    return (
        db.query(Transaction)
        .filter(or_(Transaction.account_id == account_id, Transaction.to_account == account_id))
        .order_by(Transaction.created_at.desc())
        .all()
    )
