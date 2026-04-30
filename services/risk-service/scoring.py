"""
Risk Scoring Engine — Hybrid approach combining:
1. Rule-based heuristics (deterministic flags)
2. Isolation Forest (ML anomaly detection from scikit-learn)

The IsolationForest model is trained on-the-fly using the user's own
transaction history as the "normal" baseline. Transactions that deviate
significantly from the user's typical pattern are flagged as anomalies.

Features extracted per transaction:
- amount: raw transaction value
- amount_to_balance_ratio: how large the txn is relative to current balance
- hour_of_day: when the transaction occurred (0-23)
- minutes_since_last: time gap between consecutive transactions
"""

import numpy as np
from datetime import datetime, timedelta
from typing import List
from sklearn.ensemble import IsolationForest


def _extract_features(transactions: List[dict], current_balance: float) -> np.ndarray:
    """
    Convert raw transaction dicts into a feature matrix for IsolationForest.
    Returns shape (n_transactions, 4) or empty array if insufficient data.
    """
    if not transactions:
        return np.array([])

    features = []
    sorted_txns = sorted(transactions, key=lambda t: t.get("created_at", ""))

    for i, txn in enumerate(sorted_txns):
        amount = float(txn.get("amount", 0))

        # Feature 1: raw amount
        # Feature 2: amount relative to balance (catches unusually large transactions)
        balance_ratio = amount / max(current_balance, 1.0)

        # Feature 3: hour of day (catches off-hours activity)
        created_str = txn.get("created_at", "")
        try:
            if isinstance(created_str, str):
                created = datetime.fromisoformat(created_str.replace("Z", "+00:00")).replace(tzinfo=None)
            else:
                created = created_str
            hour = created.hour
        except (ValueError, TypeError):
            hour = 12  # default to midday if parsing fails

        # Feature 4: minutes since previous transaction (catches rapid-fire activity)
        if i > 0:
            prev_str = sorted_txns[i - 1].get("created_at", "")
            try:
                if isinstance(prev_str, str):
                    prev_time = datetime.fromisoformat(prev_str.replace("Z", "+00:00")).replace(tzinfo=None)
                else:
                    prev_time = prev_str
                minutes_since_last = (created - prev_time).total_seconds() / 60.0
            except (ValueError, TypeError):
                minutes_since_last = 60.0
        else:
            minutes_since_last = 60.0  # first transaction has no prior reference

        features.append([amount, balance_ratio, hour, minutes_since_last])

    return np.array(features)


def _run_isolation_forest(features: np.ndarray) -> dict:
    """
    Train IsolationForest on the user's transaction features and detect anomalies.
    Returns dict with anomaly_count, anomaly_indices, and anomaly_score.
    """
    result = {"anomaly_count": 0, "anomaly_indices": [], "anomaly_score": 0}

    # Need at least 5 transactions for meaningful anomaly detection
    if len(features) < 5:
        return result

    # contamination=0.15 means ~15% of transactions can be anomalous
    model = IsolationForest(
        n_estimators=100,
        contamination=0.15,
        random_state=42,
    )

    predictions = model.fit_predict(features)  # 1 = normal, -1 = anomaly
    scores = model.decision_function(features)  # lower = more anomalous

    anomaly_mask = predictions == -1
    anomaly_count = int(np.sum(anomaly_mask))
    anomaly_indices = [int(x) for x in np.where(anomaly_mask)[0]]

    # Compute an overall anomaly severity (0-30 pts for ML component)
    if anomaly_count > 0:
        # Average anomaly score of flagged transactions (more negative = more anomalous)
        avg_anomaly_score = float(np.mean(scores[anomaly_mask]))
        # Map to 0-30 point range: strongly anomalous → higher penalty
        ml_score = int(min(30, max(5, -avg_anomaly_score * 20)))
    else:
        ml_score = 0

    result["anomaly_count"] = anomaly_count
    result["anomaly_indices"] = anomaly_indices
    result["anomaly_score"] = ml_score

    return result


def compute_risk_score(account_id: str, current_balance: float, recent_transactions: List[dict]):
    """
    Hybrid risk scoring: deterministic rules + IsolationForest ML anomaly detection.
    Returns score (0-100), alert_level, flags, and ml_details.
    """
    rule_score = 0
    flags = []

    # ─── Rule-based scoring (deterministic) ───

    # Rule 1: Large transaction (> 50% of balance)
    for txn in recent_transactions:
        txn_amount = txn.get("amount", 0)
        if txn_amount > current_balance * 0.5:
            rule_score += 20
            flags.append(f"Large transaction: ₹{txn_amount:,.0f} exceeds 50% of balance")
            break

    # Rule 2: Rapid transactions (3+ in 60 minutes)
    now = datetime.utcnow()
    recent_count = 0
    for txn in recent_transactions:
        created_str = txn.get("created_at", "")
        try:
            if isinstance(created_str, str):
                created = datetime.fromisoformat(created_str.replace("Z", "+00:00")).replace(tzinfo=None)
            else:
                created = created_str
            if (now - created) <= timedelta(minutes=60):
                recent_count += 1
        except (ValueError, TypeError):
            continue

    if recent_count >= 3:
        rule_score += 15
        flags.append(f"High frequency: {recent_count} transactions in the last 60 minutes")

    # Rule 3: Low balance
    if current_balance < 50000:
        rule_score += 10
        flags.append(f"Low balance: ₹{current_balance:,.0f} is below ₹50,000")

    # Rule 4: Overdraft
    if current_balance < 0:
        rule_score += 25
        flags.append("Account is overdrawn")

    # ─── ML anomaly detection (IsolationForest) ───

    ml_details = {"model": "IsolationForest", "anomaly_count": 0, "anomaly_score": 0}
    features = _extract_features(recent_transactions, current_balance)

    if len(features) >= 5:
        try:
            ml_result = _run_isolation_forest(features)
            ml_details.update(ml_result)

            if ml_result["anomaly_count"] > 0:
                flags.append(
                    f"ML anomaly detected: {ml_result['anomaly_count']} unusual transaction(s) "
                    f"flagged by Isolation Forest (severity: +{ml_result['anomaly_score']} pts)"
                )
        except Exception as e:
            ml_details["error"] = str(e)
    else:
        ml_details["note"] = f"Need 5+ transactions for ML (have {len(features)})"

    # ─── Final score ───

    ml_score = ml_details.get("anomaly_score", 0)
    base_score = 10
    total_score = min(100, base_score + rule_score + ml_score)

    # Alert level
    if total_score <= 30:
        alert_level = "low"
    elif total_score <= 60:
        alert_level = "medium"
    else:
        alert_level = "high"

    return {
        "account_id": account_id,
        "score": total_score,
        "alert_level": alert_level,
        "flags": flags,
        "ml_details": ml_details,
    }
