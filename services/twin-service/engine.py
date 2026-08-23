import os
from schemas import SimulationRequest, SimulationResult


async def run_simulation(req: SimulationRequest, auth_header: str = None) -> SimulationResult:
    real_balance = req.balance if req.balance is not None else 0.0

    # Apply scenario on a COPY — never modify real data
    if req.scenario == "withdrawal":
        virtual_balance = real_balance - req.amount
    elif req.scenario == "deposit":
        virtual_balance = real_balance + req.amount
    elif req.scenario == "rate_change":
        virtual_balance = real_balance * (1 + req.amount / 100)
    else:
        virtual_balance = real_balance

    # Risk scoring
    score = 10
    flags = []

    if req.amount > real_balance * 0.5:
        score += 30
        flags.append("Withdrawal exceeds 50% of balance")

    if virtual_balance < 50000:
        score += 20
        flags.append("Balance would drop below ₹50,000")

    if virtual_balance < 0:
        score += 40
        flags.append("Account would be overdrawn")

    score = min(score, 100)

    # Alert level
    if score <= 30:
        alert_level = "low"
    elif score <= 60:
        alert_level = "medium"
    else:
        alert_level = "high"

    # Recommendation
    if virtual_balance < 0:
        recommendation = "This action would overdraft your account. Do not proceed."
    elif alert_level == "low":
        recommendation = "This scenario looks financially stable. Safe to proceed."
    elif alert_level == "medium":
        recommendation = "Moderate risk — consider reducing the amount."
    else:
        recommendation = "High risk — this action severely impacts your financial health."

    return SimulationResult(
        account_id=req.account_id,
        scenario=req.scenario,
        amount=req.amount,
        current_balance=real_balance,
        virtual_balance=round(virtual_balance, 2),
        risk_score=score,
        alert_level=alert_level,
        flags=flags,
        recommendation=recommendation,
    )
