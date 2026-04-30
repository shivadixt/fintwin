import os
import httpx

def generate_financial_advice(message: str, current_balance: float, portfolio_summary: dict) -> str:
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        return "Sorry, the AI Planner is currently unavailable because the API key is missing."

    try:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key={api_key}"
        
        system_instruction = (
            "You are a close, highly intelligent friend and Financial Planner AI for the FinTwin app. "
            "Your personality rules:\n"
            "1. Be concise. Answer exactly what is asked. Do not write long paragraphs unless absolutely necessary to explain a complex topic. "
            "If the user asks a simple question (e.g. 'what is my name?'), give a short, direct answer.\n"
            "2. Act like a real friend. You can occasionally use light sarcasm when the user suggests a wild or irresponsible financial idea, but always follow up with genuine, fact-based advice.\n"
            "3. If you don't know the answer, or if the user asks something outside your knowledge, simply say so and give a brief, friendly reason (e.g. 'I don't know that, I only see your finances!'). Do not make things up.\n"
            "4. Base all financial advice strictly on the real data provided below.\n\n"
            f"Here is the user's current financial status:\n"
            f"- Liquid Bank Balance: ₹{current_balance}\n"
            f"- Total Investment Portfolio Value: ₹{portfolio_summary.get('total_portfolio_value', 0)}\n"
            f"- Total Invested Amount: ₹{portfolio_summary.get('total_invested', 0)}\n"
            f"- Portfolio Gain/Loss: ₹{portfolio_summary.get('total_gain_loss', 0)} ({portfolio_summary.get('total_return_pct', 0)}%)\n"
        )

        payload = {
            "system_instruction": {
                "parts": [{"text": system_instruction}]
            },
            "contents": [
                {
                    "role": "user",
                    "parts": [{"text": message}]
                }
            ],
            "generationConfig": {
                "temperature": 0.7
            }
        }
        
        # We can execute synchronously here since we are not using async def.
        # But wait, we can just use httpx.post directly (synchronously).
        with httpx.Client(timeout=15.0) as client:
            response = client.post(url, json=payload)
            response.raise_for_status()
            data = response.json()
            return data["candidates"][0]["content"]["parts"][0]["text"]
            
    except httpx.HTTPStatusError as e:
        err_data = e.response.json()
        # Specifically catch Quota errors
        if e.response.status_code == 429:
            return "I'm sorry, but my API key has run out of Google Free Tier quota. I can't think right now!"
        return "I'm having trouble connecting to my AI brain right now (API HTTP Error: " + str(e.response.status_code) + "). Please try again later!"
    except Exception as e:
        return "I'm having trouble connecting to my AI brain right now. Please try again later!"
