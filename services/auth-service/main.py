from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import Base, engine
from routers import auth, persona

app = FastAPI(title="FinTwin Auth Service", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(persona.router)


@app.on_event("startup")
def startup():
    Base.metadata.create_all(bind=engine)
    print("✅ Auth service started — users table ready")


@app.get("/")
def root():
    return {"service": "auth-service", "status": "running"}
