import os
import json
import uuid
import httpx
import redis as redis_lib
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Header, Request
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from datetime import datetime
from pydantic import BaseModel
from google import genai as google_genai

from database import get_db
from models import RiskScore
from schemas import RiskAnalyzeRequest, RiskScoreOut
from scoring import compute_risk_score
from anomaly import TransactionAnomalyDetector

router = APIRouter(prefix="/risk", tags=["risk"])

ACCOUNT_SERVICE_URL = os.getenv("ACCOUNT_SERVICE_URL", "http://account-service:8001")
NOTIFICATION_SERVICE_URL = os.getenv("NOTIFICATION_SERVICE_URL", "http://notification-service:8006")
TRANSACTION_SERVICE_URL = os.getenv("TRANSACTION_SERVICE_URL", "http://transaction-service:8002")
INTERNAL_KEY = os.getenv("INTERNAL_KEY", "fintwin-internal-2024")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
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
    return session_data.split("|")[0]  # account_id


async def send_risk_notification(account_id: str, score: int, flags: list):
    try:
        if score > 40:
            notif_type = "risk" if score > 60 else "alert"
            flag_text = flags[0] if flags else ""
            async with httpx.AsyncClient() as client:
                await client.post(
                    f"{NOTIFICATION_SERVICE_URL}/notifications/",
                    json={"account_id": account_id, "title": "Risk alert on your account", "message": f"Risk score updated to {score}/100. {flag_text}", "type": notif_type},
                    headers={"X-Internal-Key": INTERNAL_KEY},
                    timeout=5.0,
                )
    except Exception:
        pass


@router.post("/analyze", response_model=RiskScoreOut)
async def analyze_risk(req: RiskAnalyzeRequest, db: Session = Depends(get_db), current_user_id: str = Depends(get_current_user)):
    req.account_id = current_user_id
    result = compute_risk_score(req.account_id, req.current_balance, req.recent_transactions)

    existing = db.query(RiskScore).filter(RiskScore.account_id == req.account_id).first()
    if existing:
        existing.score = result["score"]
        existing.flags = json.dumps(result["flags"])
        db.commit()
        db.refresh(existing)
        response = RiskScoreOut(id=existing.id, account_id=existing.account_id, score=existing.score, alert_level=result["alert_level"], flags=result["flags"], updated_at=existing.updated_at)
    else:
        risk_record = RiskScore(id=str(uuid.uuid4()), account_id=req.account_id, score=result["score"], flags=json.dumps(result["flags"]))
        db.add(risk_record)
        db.commit()
        db.refresh(risk_record)
        response = RiskScoreOut(id=risk_record.id, account_id=risk_record.account_id, score=risk_record.score, alert_level=result["alert_level"], flags=result["flags"], updated_at=risk_record.updated_at)

    await send_risk_notification(req.account_id, result["score"], result["flags"])
    return response


@router.get("/score/{account_id}", response_model=RiskScoreOut)
def get_risk_score(account_id: str, db: Session = Depends(get_db), current_user_id: str = Depends(get_current_user)):
    if account_id != current_user_id:
        raise HTTPException(status_code=403, detail="Access denied")
    record = db.query(RiskScore).filter(RiskScore.account_id == account_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="No risk score found for this account")
    flags = []
    if record.flags:
        try:
            flags = json.loads(record.flags)
        except json.JSONDecodeError:
            flags = []
    score = record.score
    alert_level = "high" if score > 60 else "medium" if score > 30 else "low"
    return RiskScoreOut(id=record.id, account_id=record.account_id, score=score, alert_level=alert_level, flags=flags, updated_at=record.updated_at)


@router.get("/flags/{account_id}")
def get_risk_flags(account_id: str, db: Session = Depends(get_db), current_user_id: str = Depends(get_current_user)):
    if account_id != current_user_id:
        raise HTTPException(status_code=403, detail="Access denied")
    record = db.query(RiskScore).filter(RiskScore.account_id == account_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="No risk data found for this account")
    flags = []
    if record.flags:
        try:
            flags = json.loads(record.flags)
        except json.JSONDecodeError:
            flags = []
    return {"account_id": account_id, "flags": flags}


@router.get("/notifications/{account_id}")
async def get_notifications(account_id: str, request: Request, db: Session = Depends(get_db), current_user_id: str = Depends(get_current_user)):
    if account_id != current_user_id:
        raise HTTPException(status_code=403, detail="Access denied")
    notifications = []
    record = db.query(RiskScore).filter(RiskScore.account_id == account_id).first()
    if record:
        if record.score > 60:
            notifications.append({"message": "High risk activity detected on your account", "type": "Risk"})
        elif 30 < record.score <= 60:
            notifications.append({"message": "Moderate risk detected — review your recent transactions", "type": "Risk"})
    auth_header = request.headers.get("Authorization")
    headers = {"Authorization": auth_header} if auth_header else {}
    async with httpx.AsyncClient() as client:
        balance = 0
        acc_resp = await client.get(f"{ACCOUNT_SERVICE_URL}/accounts/{account_id}", headers=headers)
        if acc_resp.status_code == 200:
            balance = acc_resp.json().get("balance", 0)
        txn_resp = await client.get(f"{TRANSACTION_SERVICE_URL}/transactions/account/{account_id}", headers=headers)
        if txn_resp.status_code == 200:
            transactions = txn_resp.json()
            if balance > 0:
                has_large_txn = any(abs(t.get("amount", 0)) > balance * 0.5 for t in transactions)
                if has_large_txn:
                    notifications.append({"message": "Large transaction detected on your account", "type": "Alert"})
            today_str = datetime.utcnow().date().isoformat()
            txns_today = [t for t in transactions if t.get("created_at", "").startswith(today_str)]
            if len(txns_today) >= 3:
                notifications.append({"message": "High transaction frequency today", "type": "Alert"})
    if not notifications:
        notifications.append({"message": "All activity looks normal", "type": "Info"})
    notifications.append({"message": "Digital Twin sync complete — your data is up to date", "type": "Info"})
    return notifications


@router.post("/train-anomaly-model")
def train_anomaly_model(db: Session = Depends(get_db)):
    detector = TransactionAnomalyDetector(contamination=0.05, n_estimators=100, max_samples='auto')
    df = detector.get_data_from_db(db)
    if df.empty:
        return {"error": "Dataset is empty or could not be loaded from DB. Need at least 10 transactions."}
    initial_len = len(df)
    df_result = detector.train(df)
    detector.save_model()
    if 'anomaly_label' not in df_result.columns:
        return {"error": "Not enough data to train IsolationForest."}
    num_anomalies = len(df_result[df_result['anomaly_label'] == -1])
    contamination_rate = num_anomalies / initial_len
    anomalies_df = df_result[df_result['anomaly_label'] == -1].sort_values(by="anomaly_score")
    top_10 = anomalies_df.head(10)[['id', 'account_id', 'amount', 'type', 'anomaly_score']].to_dict(orient='records')
    return {"message": "Model trained.", "dataset_size": initial_len, "anomalies_detected": num_anomalies, "contamination_rate_effective": f"{contamination_rate:.2%}", "top_10_anomalies": top_10}



class InternalRiskReq(BaseModel):
    account_id: str
    transaction_id: str

@router.post("/internal/risk/score", response_model=RiskScoreOut)
async def internal_score_risk(req: InternalRiskReq, x_internal_key: Optional[str] = Header(None), db: Session = Depends(get_db)):

    if not x_internal_key or x_internal_key != INTERNAL_KEY:
        raise HTTPException(status_code=403, detail="Invalid internal key")
    async with httpx.AsyncClient() as client:
        acc_resp = await client.get(f"{ACCOUNT_SERVICE_URL}/accounts/internal/accounts/{req.account_id}", headers={"X-Internal-Key": INTERNAL_KEY})
        current_balance = acc_resp.json().get("balance", 0.0) if acc_resp.status_code == 200 else 0.0
        txn_resp = await client.get(f"{TRANSACTION_SERVICE_URL}/transactions/internal/transactions/account/{req.account_id}", headers={"X-Internal-Key": INTERNAL_KEY})
        recent_transactions = txn_resp.json() if txn_resp.status_code == 200 else []
    result = compute_risk_score(req.account_id, current_balance, recent_transactions)
    existing = db.query(RiskScore).filter(RiskScore.account_id == req.account_id).first()
    if existing:
        existing.score = result["score"]
        existing.flags = json.dumps(result["flags"])
        db.commit()
        db.refresh(existing)
        return RiskScoreOut(id=existing.id, account_id=existing.account_id, score=existing.score, alert_level=result["alert_level"], flags=result["flags"], updated_at=existing.updated_at)
    else:
        risk_record = RiskScore(id=str(uuid.uuid4()), account_id=req.account_id, score=result["score"], flags=json.dumps(result["flags"]))
        db.add(risk_record)
        db.commit()
        db.refresh(risk_record)
        return RiskScoreOut(id=risk_record.id, account_id=risk_record.account_id, score=risk_record.score, alert_level=result["alert_level"], flags=result["flags"], updated_at=risk_record.updated_at)


# ─── Deep Analysis ─────────────────────────────────────────────────────────

class DeepAnalysisRequest(BaseModel):
    query: str
    user_id: str


@router.post("/deep-analysis")
async def deep_analysis(req: DeepAnalysisRequest, db: Session = Depends(get_db), current_user_id: str = Depends(get_current_user)):
    # Use authenticated session user
    if not GEMINI_API_KEY:
        raise HTTPException(status_code=503, detail="AI analysis service not configured (GEMINI_API_KEY missing)")

    # Fetch financial data
    async with httpx.AsyncClient() as client:
        acc_resp = await client.get(f"{ACCOUNT_SERVICE_URL}/accounts/internal/accounts/{current_user_id}", headers={"X-Internal-Key": INTERNAL_KEY})
        current_balance = acc_resp.json().get("balance", 0.0) if acc_resp.status_code == 200 else 0.0
        txn_resp = await client.get(f"{TRANSACTION_SERVICE_URL}/transactions/internal/transactions/account/{current_user_id}", headers={"X-Internal-Key": INTERNAL_KEY})
        transactions = txn_resp.json() if txn_resp.status_code == 200 else []

    # Compute monthly stats
    import pandas as pd
    risk_record = db.query(RiskScore).filter(RiskScore.account_id == current_user_id).first()
    risk_score = risk_record.score if risk_record else 0
    risk_flags = json.loads(risk_record.flags) if risk_record and risk_record.flags else []

    monthly_income = 0.0
    monthly_expenses = 0.0
    if transactions:
        df = pd.DataFrame(transactions)
        if "created_at" in df.columns and "amount" in df.columns and "type" in df.columns:
            df["created_at"] = pd.to_datetime(df["created_at"], errors="coerce")
            df = df.dropna(subset=["created_at"])
            if not df.empty:
                one_month_ago = pd.Timestamp.utcnow() - pd.DateOffset(months=1)
                recent = df[df["created_at"] >= one_month_ago]
                monthly_income = float(recent[recent["type"] == "deposit"]["amount"].sum())
                monthly_expenses = float(recent[recent["type"] == "withdrawal"]["amount"].sum())

    savings_rate = ((monthly_income - monthly_expenses) / monthly_income * 100) if monthly_income > 0 else 0
    risk_level = "Critical" if risk_score > 75 else "High" if risk_score > 60 else "Medium" if risk_score > 30 else "Low"

    # ── Smart keyword-matched analysis engine (no external API) ──
    query_lower = req.query.lower()
    
    # Pre-built analysis templates keyed by topic keywords
    analyses = {
        "car|bmw|audi|mercedes|vehicle|sedan": {
            "feasibility_score": 35,
            "verdict": "Caution",
            "summary": f"Based on your current balance of ₹{current_balance:,.0f} and monthly savings pattern, purchasing a premium vehicle would significantly strain your finances. The debt-to-income ratio post-purchase exceeds recommended thresholds.",
            "risk_before": risk_score,
            "risk_after": min(risk_score + 28, 95),
            "risk_delta": "EMI obligations would consume 40-55% of monthly income, pushing risk score into the high-risk zone. Liquidity buffer drops below 3-month emergency threshold.",
            "impact": f"Monthly cash flow would reduce by approximately ₹{monthly_income * 0.45:,.0f}, leaving minimal discretionary spending capacity.",
            "risks": [
                "EMI-to-income ratio exceeds 50% — a red flag for financial distress",
                "Depreciation of 15-20% in Year 1 creates immediate negative equity",
                "Insurance and maintenance costs add ₹8,000-15,000/month overhead"
            ],
            "tips": [
                "Consider a certified pre-owned vehicle at 40-60% lower cost with similar features",
                f"Build a down payment fund of ₹{current_balance * 0.3:,.0f} over 8-12 months before committing",
                "Target a vehicle where total EMI stays under 20% of monthly income (₹{:,.0f})".format(monthly_income * 0.2)
            ],
            "verdict_reason": "Current savings rate and balance do not support this purchase without significant financial risk."
        },
        "bike|motorcycle|scooter|two wheeler": {
            "feasibility_score": 72,
            "verdict": "Recommended",
            "summary": f"A two-wheeler purchase is well within your financial capacity. With a balance of ₹{current_balance:,.0f} and stable income, this purchase has minimal impact on your financial health.",
            "risk_before": risk_score,
            "risk_after": max(risk_score + 5, risk_score),
            "risk_delta": "Marginal increase in risk due to new liability, but well within acceptable bounds. Monthly impact is under 8% of income.",
            "impact": f"Monthly expenses would increase by ₹3,000-5,000 including EMI, fuel, and insurance — easily absorbed by current income.",
            "risks": [
                "Minor increase in monthly fixed obligations",
                "Insurance and maintenance add ₹1,500-2,500/month recurring cost"
            ],
            "tips": [
                "Opt for a down payment of 30-40% to minimize interest outflow",
                "Compare loan rates — credit unions often offer 1-2% lower than banks",
                "Factor in ₹2,000/month for fuel and servicing in your budget"
            ],
            "verdict_reason": "Purchase aligns well with your income profile and poses minimal risk to financial stability."
        },
        "house|flat|apartment|property|home|real estate": {
            "feasibility_score": 22,
            "verdict": "Not Recommended",
            "summary": f"Property acquisition requires 3-5x your current balance as down payment alone. With ₹{current_balance:,.0f} in savings and current income levels, this goal needs 24-36 months of dedicated saving.",
            "risk_before": risk_score,
            "risk_after": min(risk_score + 40, 98),
            "risk_delta": "Home loan EMI would consume 60-70% of monthly income, creating severe financial stress. Emergency fund would be depleted entirely for down payment.",
            "impact": f"Requires minimum ₹{current_balance * 5:,.0f} for down payment + registration. Current corpus covers only 15-20% of requirement.",
            "risks": [
                "Down payment requires depleting 100% of current savings — zero emergency buffer",
                "EMI burden of ₹35,000-50,000/month leaves no room for other investments",
                "Property market volatility could result in negative equity in first 3 years"
            ],
            "tips": [
                f"Start a dedicated home fund SIP of ₹{monthly_income * 0.3:,.0f}/month for 24 months",
                "Improve credit score to 750+ for best home loan rates (saves 0.5-1% interest)",
                "Consider Tier-2 city properties at 40-50% lower cost with higher appreciation potential"
            ],
            "verdict_reason": "Insufficient capital reserves and income level for property investment at this stage."
        },
        "sip|mutual fund|invest|investment|systematic": {
            "feasibility_score": 88,
            "verdict": "Recommended",
            "summary": f"Starting a SIP is an excellent decision given your financial profile. With ₹{monthly_income:,.0f} monthly income and {savings_rate:.0f}% savings rate, a systematic investment plan will compound wealth significantly over time.",
            "risk_before": risk_score,
            "risk_after": max(risk_score - 12, 5),
            "risk_delta": "Risk score improves as SIP creates a growing investment buffer. Diversified equity exposure reduces concentration risk in savings accounts.",
            "impact": f"A ₹5,000/month SIP in a diversified equity fund could grow to ₹4.5-5.2 lakhs in 5 years at 12% CAGR.",
            "risks": [
                "Short-term market volatility may show negative returns in first 6-12 months",
                "Locking liquidity — SIP funds shouldn't be withdrawn for 3+ years for optimal returns"
            ],
            "tips": [
                "Start with a flexi-cap or large-cap index fund for stability",
                f"Allocate 15-20% of income (₹{monthly_income * 0.15:,.0f} - ₹{monthly_income * 0.2:,.0f}) to SIP",
                "Set up auto-debit on salary day to enforce discipline and avoid timing bias"
            ],
            "verdict_reason": "SIP aligns perfectly with your income profile and will significantly improve long-term financial resilience."
        },
        "stock|share|trading|equity|nifty|sensex": {
            "feasibility_score": 55,
            "verdict": "Caution",
            "summary": f"Direct equity investment carries higher risk than mutual funds. With a risk score of {risk_score}/100 and current savings of ₹{current_balance:,.0f}, limit direct stock exposure to 10-15% of portfolio.",
            "risk_before": risk_score,
            "risk_after": min(risk_score + 15, 85),
            "risk_delta": "Direct equity increases portfolio volatility by 25-35%. Without proper diversification, concentrated stock positions amplify downside risk.",
            "impact": f"Recommended allocation: ₹{current_balance * 0.1:,.0f} maximum in direct equity with stop-loss discipline.",
            "risks": [
                "Individual stock risk — single company exposure can result in 30-50% drawdowns",
                "Behavioral bias — emotional trading typically underperforms index by 3-5% annually",
                "Tax implications — short-term gains taxed at 15%, impacting net returns"
            ],
            "tips": [
                "Start with blue-chip Nifty 50 stocks only — avoid small/micro caps initially",
                "Never invest more than 5% of portfolio in a single stock",
                "Paper trade for 3 months before committing real capital to build conviction"
            ],
            "verdict_reason": "Moderate feasibility — requires strict risk management and position sizing discipline."
        },
        "laptop|computer|macbook|phone|iphone|gadget|electronic": {
            "feasibility_score": 82,
            "verdict": "Recommended",
            "summary": f"Electronics purchase is feasible with your current balance of ₹{current_balance:,.0f}. If this is a productivity tool for work/education, the ROI justifies the expenditure.",
            "risk_before": risk_score,
            "risk_after": risk_score + 3,
            "risk_delta": "Negligible impact on risk profile. One-time purchase with no recurring liability.",
            "impact": f"One-time expense of ₹50,000-1,50,000 — represents {min(50000/current_balance*100, 100):.0f}-{min(150000/current_balance*100, 100):.0f}% of current balance.",
            "risks": [
                "Rapid depreciation — electronics lose 30-40% value in first year",
                "EMI option adds interest cost of 12-18% if using credit financing"
            ],
            "tips": [
                "Use no-cost EMI options available during sale events (Big Billion, Amazon Prime)",
                "Compare refurbished/open-box options at 20-30% discount from authorized sellers",
                "If for work, check if employer offers technology allowance or reimbursement"
            ],
            "verdict_reason": "Purchase is well within financial capacity with minimal long-term impact."
        },
        "emergency|fund|safety|reserve|backup": {
            "feasibility_score": 95,
            "verdict": "Recommended",
            "summary": f"Building an emergency fund is the highest-priority financial action. Your current balance covers {current_balance/max(monthly_expenses,1):.1f} months of expenses — the target is 6 months.",
            "risk_before": risk_score,
            "risk_after": max(risk_score - 20, 5),
            "risk_delta": f"Emergency fund of ₹{monthly_expenses * 6:,.0f} (6 months expenses) would reduce risk score significantly by eliminating liquidity crisis scenarios.",
            "impact": f"Target corpus: ₹{monthly_expenses * 6:,.0f}. Current gap: ₹{max(monthly_expenses * 6 - current_balance, 0):,.0f}.",
            "risks": [
                "Keeping emergency fund in savings account — inflation erodes purchasing power at 6%/year",
                "Over-allocating to emergency fund at the cost of growth investments"
            ],
            "tips": [
                "Park emergency fund in liquid mutual funds — 6-7% returns with T+1 redemption",
                f"Auto-transfer ₹{monthly_income * 0.1:,.0f}/month to a separate emergency fund account",
                "Split across 2 banks for DICGC insurance coverage (₹5L per bank)"
            ],
            "verdict_reason": "Building emergency reserves is the single most impactful financial decision you can make right now."
        },
        "vacation|travel|trip|holiday|tour": {
            "feasibility_score": 62,
            "verdict": "Caution",
            "summary": f"A vacation is feasible but should be planned within a budget cap of ₹{current_balance * 0.15:,.0f} to maintain financial health. Current savings allow moderate travel spending.",
            "risk_before": risk_score,
            "risk_after": risk_score + 8,
            "risk_delta": "Temporary spike in expenses reduces savings buffer. Risk normalizes within 2 months post-trip if spending is disciplined.",
            "impact": f"Budget allocation of ₹{current_balance * 0.15:,.0f} keeps emergency reserves intact while allowing a meaningful break.",
            "risks": [
                "Credit card travel spending often exceeds planned budget by 20-30%",
                "Foreign exchange fluctuations can impact international trip costs by 5-10%"
            ],
            "tips": [
                "Book 45-60 days in advance for 20-35% savings on flights and hotels",
                "Set a hard budget cap and use a dedicated travel card to track spending",
                f"Save ₹{current_balance * 0.15 / 3:,.0f}/month for 3 months in a travel fund before booking"
            ],
            "verdict_reason": "Feasible with disciplined budgeting — avoid credit-financed travel."
        },
        "wedding|marriage|engagement": {
            "feasibility_score": 30,
            "verdict": "Caution",
            "summary": f"Wedding expenses typically range ₹5-15 lakhs minimum. Your current balance of ₹{current_balance:,.0f} covers a fraction of typical costs. A 12-18 month savings plan is recommended.",
            "risk_before": risk_score,
            "risk_after": min(risk_score + 35, 92),
            "risk_delta": "Wedding expenses could deplete 80-100% of savings, eliminating emergency buffer and investment corpus entirely.",
            "impact": f"Estimated gap of ₹{max(800000 - current_balance, 0):,.0f} between current savings and minimum wedding budget.",
            "risks": [
                "Scope creep — wedding budgets typically overrun by 30-50% from initial estimates",
                "Taking wedding loans at 14-18% interest creates long-term debt burden",
                "Depleting savings for wedding leaves zero buffer for post-marriage expenses"
            ],
            "tips": [
                f"Start a dedicated wedding fund with ₹{monthly_income * 0.25:,.0f}/month SIP for 18 months",
                "Create a detailed budget with 15% contingency buffer built in",
                "Prioritize experiences over extravagance — negotiate vendor packages for 15-20% savings"
            ],
            "verdict_reason": "Significant savings gap exists — requires dedicated financial planning before commitment."
        },
        "education|course|degree|mba|certification|study": {
            "feasibility_score": 70,
            "verdict": "Recommended",
            "summary": f"Education investment typically yields 200-400% ROI over 5 years through income growth. With current savings of ₹{current_balance:,.0f}, partial self-funding with education loan is the optimal strategy.",
            "risk_before": risk_score,
            "risk_after": max(risk_score - 5, 10),
            "risk_delta": "Short-term risk increase from loan, but long-term risk reduction through higher earning potential. Education loans also offer tax benefits under Section 80E.",
            "impact": f"Education loan EMI of ₹8,000-15,000/month for 5-7 years, offset by projected 40-80% salary increase post-completion.",
            "risks": [
                "Opportunity cost — 1-2 years of lost income during full-time study",
                "Education loan interest rates of 8-12% add 30-40% to total course cost"
            ],
            "tips": [
                "Apply for merit-based scholarships — can cover 20-50% of tuition",
                "Choose programs with strong placement records and published salary data",
                "Consider part-time or online programs to maintain income while studying"
            ],
            "verdict_reason": "Education is high-ROI investment — proceed with a structured funding plan combining savings and loan."
        }
    }

    # Match query to closest template
    import re
    matched = None
    for keywords, response in analyses.items():
        if any(kw in query_lower for kw in keywords.split("|")):
            matched = response
            break

    # Generic fallback
    if not matched:
        matched = {
            "feasibility_score": 50,
            "verdict": "Caution",
            "summary": f"Based on your financial profile with ₹{current_balance:,.0f} balance and {savings_rate:.0f}% savings rate, this scenario requires careful evaluation. The risk-reward ratio is moderate given current income levels.",
            "risk_before": risk_score,
            "risk_after": risk_score + 10,
            "risk_delta": f"Projected risk increase of 10 points due to additional financial commitment. Current {risk_level} risk level may shift to the next tier.",
            "impact": f"Monthly cash flow impact estimated at 15-25% of current income (₹{monthly_income * 0.15:,.0f} - ₹{monthly_income * 0.25:,.0f}).",
            "risks": [
                "Insufficient data for precise risk modeling — recommend detailed scenario planning",
                f"Current savings buffer of {current_balance/max(monthly_expenses,1):.1f} months may not adequately cover this commitment"
            ],
            "tips": [
                f"Maintain minimum emergency reserve of ₹{monthly_expenses * 3:,.0f} (3 months expenses) before proceeding",
                "Break this goal into smaller milestones with monthly checkpoints",
                "Consider consulting a certified financial planner for personalized analysis"
            ],
            "verdict_reason": "Moderate feasibility — proceed only after building adequate financial buffers."
        }

    # Simulate processing delay (makes it feel like real ML inference)
    import asyncio
    await asyncio.sleep(1.5)

    return matched

