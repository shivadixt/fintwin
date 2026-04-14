import os
from google import genai

api_key = os.getenv("GEMINI_API_KEY", "")
client = genai.Client(api_key=api_key)

for m in client.models.list():
    print(m.name)
