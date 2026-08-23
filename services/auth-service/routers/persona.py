from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models import User
from schemas import PersonaScoreOut, PersonaTip
from jwt_utils import get_current_user_id

router = APIRouter(prefix="/auth", tags=["persona"])


PERSONA_MAP = {
    ("savings", "low"): {
        "label": "Conservative Saver",
        "emoji": "🛡️",
        "base_score": 65,
    },
    ("savings", "medium"): {
        "label": "Steady Saver",
        "emoji": "💰",
        "base_score": 60,
    },
    ("savings", "high"): {
        "label": "Dynamic Saver",
        "emoji": "⚡",
        "base_score": 55,
    },
    ("investment", "low"): {
        "label": "Cautious Investor",
        "emoji": "🔍",
        "base_score": 58,
    },
    ("investment", "medium"): {
        "label": "Balanced Builder",
        "emoji": "⚖️",
        "base_score": 72,
    },
    ("investment", "high"): {
        "label": "Aggressive Investor",
        "emoji": "🚀",
        "base_score": 80,
    },
    ("debt_payoff", "low"): {
        "label": "Careful Debt Crusher",
        "emoji": "🎯",
        "base_score": 50,
    },
    ("debt_payoff", "medium"): {
        "label": "Debt Crusher",
        "emoji": "💪",
        "base_score": 62,
    },
    ("debt_payoff", "high"): {
        "label": "Rapid Debt Slayer",
        "emoji": "🔥",
        "base_score": 70,
    },
    ("wealth_building", "low"): {
        "label": "Patient Wealth Builder",
        "emoji": "🌱",
        "base_score": 68,
    },
    ("wealth_building", "medium"): {
        "label": "Strategic Wealth Builder",
        "emoji": "📈",
        "base_score": 78,
    },
    ("wealth_building", "high"): {
        "label": "Empire Builder",
        "emoji": "🏆",
        "base_score": 88,
    },
}

TIPS_MAP = {
    "savings": [
        PersonaTip(icon="💡", text="Set up automatic transfers to your savings account on payday to build discipline."),
        PersonaTip(icon="📊", text="Track your expenses weekly — small leaks sink big ships."),
        PersonaTip(icon="🎯", text="Aim to build an emergency fund covering 6 months of expenses first."),
    ],
    "investment": [
        PersonaTip(icon="📈", text="Diversify across asset classes — don't put all eggs in one basket."),
        PersonaTip(icon="⏰", text="Start early and stay consistent — compound interest is your best friend."),
        PersonaTip(icon="📚", text="Research before investing — understand the risk-reward ratio of each asset."),
    ],
    "debt_payoff": [
        PersonaTip(icon="🔥", text="Use the avalanche method — pay off highest interest rate debts first."),
        PersonaTip(icon="💳", text="Consolidate high-interest debts into a lower rate loan if possible."),
        PersonaTip(icon="🚫", text="Avoid new debt while paying off existing ones — freeze unnecessary spending."),
    ],
    "wealth_building": [
        PersonaTip(icon="🏗️", text="Build multiple income streams — salary alone rarely creates wealth."),
        PersonaTip(icon="🧠", text="Invest in yourself — skills and knowledge compound faster than money."),
        PersonaTip(icon="📋", text="Create a financial plan with milestones — what gets measured gets managed."),
    ],
}


def compute_income_modifier(monthly_income: float) -> int:
    """Add score points based on income bracket."""
    if monthly_income >= 200000:
        return 10
    elif monthly_income >= 100000:
        return 7
    elif monthly_income >= 50000:
        return 4
    elif monthly_income >= 25000:
        return 2
    return 0


@router.get("/persona-score", response_model=PersonaScoreOut)
def get_persona_score(
    current_user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Compute and return the Financial Persona Score based on user profile."""
    user = db.query(User).filter(User.id == current_user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if not user.is_profile_complete:
        raise HTTPException(status_code=400, detail="Profile not complete — finish onboarding first")

    goal = user.financial_goal or "savings"
    risk = user.risk_appetite or "medium"
    income = user.monthly_income or 0.0

    persona_key = (goal, risk)
    persona = PERSONA_MAP.get(persona_key, {
        "label": "Balanced Builder",
        "emoji": "⚖️",
        "base_score": 60,
    })

    score = min(persona["base_score"] + compute_income_modifier(income), 100)
    tips = TIPS_MAP.get(goal, TIPS_MAP["savings"])

    return PersonaScoreOut(
        label=persona["label"],
        emoji=persona["emoji"],
        score=score,
        tips=tips,
    )
