import os
from google import genai

api_key = "AIzaSyB25-oI7MWRN0CKk9gQgBf8bZeE6HUbqWI"
client = genai.Client(api_key=api_key)

for m in client.models.list():
    print(m.name)
