# FinTwin — Financial Digital Twin System

FinTwin is a modern, fully-isolated, multi-tenant financial architecture that allows users to manage their finances, track real-time transactions, run "Digital Twin" simulations, and receive AI-driven financial persona insights — all without touching live data during what-if analysis.

## 🏗️ Architecture

FinTwin utilizes a robust microservices architecture containerized via **Docker** and orchestrated using **Docker Compose**. All internal traffic is routed through an **Nginx** API Gateway.

```
┌─────────────────────────────────────────────────────────┐
│                    Frontend (React 18 + Vite)            │
│              localhost:3000 → Nginx :80 proxy            │
└───────────────────────────┬─────────────────────────────┘
                            │
                    ┌───────┴───────┐
                    │  Nginx :80    │
                    │  API Gateway  │
                    └───────┬───────┘
                            │
          ┌─────────┬───────┼───────┬──────────┬──────────┐
          │         │       │       │          │          │
     Auth :8007  Txn :8002 Twin  Risk :8004  Portfolio  Notif
                         :8003              :8005     :8006
          │         │       │       │          │          │
          └─────────┴───────┼───────┴──────────┴──────────┘
                            │
                  ┌─────────┴─────────┐
                  │  PostgreSQL :5432  │
                  │  Redis :6379      │
                  └───────────────────┘
```

### Core Microservices (Backend)

Written in **Python (FastAPI)** and communicating with a single **PostgreSQL** database (with separate logical models), the backend is broken into six independent services with **Redis** for caching:

1. **Auth Service (`:8007`)** — *NEW: Replaces old Account Service*
   - Google OAuth 2.0 login via ID token verification
   - User profile management and onboarding flow
   - JWT (`ft_token`) generation using HS256
   - Financial Persona Score computation (12 persona types based on goals + risk)
   - Endpoints: `/auth/google`, `/auth/me`, `/auth/profile`, `/auth/persona-score`

2. **Transaction Service (`:8002`)**
   - Logs deposits, withdrawals, and inter-user transfers
   - Strict `WHERE` filtering ensures users only interact with their own money
   - Supports pagination with `limit`/`offset` parameters

3. **Twin Service (`:8003`)**
   - The Digital Twin engine — run hypothetical scenarios (rate changes, withdrawals) on virtual copies of your balance
   - Simulation history with save/delete/clear operations
   - No live data is modified during simulations

4. **Risk Service (`:8004`)**
   - Real-time risk scoring (0-100) based on balance, transaction velocity, and anomaly detection
   - Generates user-specific notifications on the dashboard
   - Cross-service data aggregation for comprehensive risk assessment

5. **Portfolio Service (`:8005`)**
   - Aggregates user transaction data to present a holistic wealth view
   - Implements pagination and optimizations for frontend display

6. **Notification Service (`:8006`)**
   - Manages system and user-specific alerts
   - Integrates across services to keep users informed

### Frontend

- **Framework**: React 18 with React Router DOM
- **Build Tool**: Vite
- **Styling**: Context-aware custom Vanilla CSS (dark/light themes)
- **HTTP Client**: Axios with JWT interceptors
- **Auth**: `@react-oauth/google` for Google Sign-In
- **AI Assistant**: Built-in FinBot powered by Gemini API

### Pages

| Page | Route | Description |
|------|-------|-------------|
| Login | `/login` | Google OAuth sign-in with animated UI |
| Onboarding | `/onboarding` | 2-step setup: personal info + initial deposit |
| Dashboard | `/dashboard` | Persona score, account info, stats, transactions |
| Transactions | `/transactions` | Create deposits/withdrawals/transfers, view history |
| Digital Twin | `/twin` | Run what-if financial simulations |
| Risk Analysis | `/risk` | View risk score, flags, and run analysis |
| Portfolio | `/portfolio` | Holistic wealth overview |
| Notifications | `/notifications` | System alerts and activity feed |

## 🛡️ Security & Multi-Tenancy

FinTwin adheres to a strict Zero-Trust philosophy. Data leakage between users is prevented at the backend query layer.

- **Google OAuth 2.0**: Users authenticate via Google — no passwords stored
- **JWT Authorization**: All endpoints require a signed `ft_token` via `Authorization: Bearer <token>` header
- **Identity Lock**: User ID is extracted from JWT (`jwt.decode(token).get("sub")`), client payloads cannot spoof identity
- **Protected Routes**: Frontend enforces authentication + profile completion before granting dashboard access
- **Clock Skew Tolerance**: Token verification allows 30s clock drift for Docker compatibility

## 📦 Dependencies

### Backend Packages (Python 3.11+)

- `fastapi` — API Framework
- `uvicorn` — ASGI Server
- `sqlalchemy` — ORM
- `psycopg2-binary` — Postgres driver
- `google-auth` / `google-auth-oauthlib` — Google OAuth verification
- `python-jose[cryptography]` — JWT generation & decoding
- `httpx` — Internal server-to-server HTTP client
- `pydantic` — Data validation
- `redis` — In-memory caching client

### Frontend Packages (Node.js)

- `react` / `react-dom` (^18.2.0)
- `react-router-dom` — URL-based routing with protected routes
- `@react-oauth/google` — Google Sign-In integration
- `vite` (^5.0.8)
- `axios` (^1.6.2)

### Infrastructure

- `docker` & `docker-compose`
- `nginx:latest`
- `postgres:15`
- `redis:7-alpine`

## 🚀 Setup & Execution

### Prerequisites

- Docker Engine & Docker Compose installed
- A Google Cloud OAuth 2.0 Client ID ([create one here](https://console.cloud.google.com/apis/credentials))

### Environment Setup

Create a `.env` file in the project root:

```env
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_DB=fintwin
DATABASE_URL=postgresql://postgres:postgres@db:5432/fintwin
JWT_SECRET=your-jwt-secret-here
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret
VITE_GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
```

### Google OAuth Setup

1. Go to [Google Cloud Console → APIs & Services → Credentials](https://console.cloud.google.com/apis/credentials)
2. Create an **OAuth 2.0 Client ID** (Web application)
3. Add **Authorized JavaScript origins**: `http://localhost:3000`, `http://localhost`
4. Add **Authorized redirect URIs**: `http://localhost:3000`
5. Copy the Client ID to `GOOGLE_CLIENT_ID` and `VITE_GOOGLE_CLIENT_ID` in `.env`
6. Set up **OAuth consent screen** → add your email as a test user

### Running Locally

```bash
# Start all backend services
docker compose up -d --build

# Start frontend dev server
cd frontend
npm install
npm run dev
```

### Access Points

| Service | URL |
|---------|-----|
| Frontend App | [http://localhost:3000](http://localhost:3000) |
| Nginx Gateway | [http://localhost:80](http://localhost:80) |
| PostgreSQL | `localhost:5432` (user: `postgres`, pass: `postgres`) |
| Redis | `localhost:6379` |

## 📝 API Endpoints

### Auth (`/api/auth/`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/auth/google` | Public | Verify Google ID token, create/fetch user, return `ft_token` |
| `GET` | `/auth/me` | JWT | Get current user profile |
| `PUT` | `/auth/profile` | JWT | Save onboarding profile data |
| `GET` | `/auth/profile/complete` | JWT | Check if profile is complete |
| `GET` | `/auth/persona-score` | JWT | Get Financial Persona Score + tips |

### Transactions (`/api/transactions/`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/transactions/` | JWT | Create deposit, withdrawal, or transfer |
| `GET` | `/transactions/` | JWT | List user's transactions (paginated) |
| `GET` | `/transactions/account/{id}` | JWT | Get transactions for specific account |

### Digital Twin (`/api/simulate/`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/simulate/` | JWT | Run what-if simulation |
| `GET` | `/simulate/history/{id}` | JWT | Get simulation history |
| `DELETE` | `/simulate/history/{id}` | JWT | Clear simulation history |

### Risk Analysis (`/api/risk/`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/risk/analyze` | JWT | Run risk analysis |
| `GET` | `/risk/score/{id}` | JWT | Get current risk score |
| `GET` | `/risk/notifications/{id}` | JWT | Get smart risk alerts |

### Portfolio & Notifications

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/portfolio/` | JWT | Aggregated wealth summary |
| `GET` | `/notifications/` | JWT | User-specific system alerts |

## 🎯 Key Features

- **Google OAuth Login** — No passwords, instant sign-in
- **2-Step Onboarding** — Personal info + initial deposit to get started fast
- **Financial Persona Score** — AI-driven 0-100 score with persona label (e.g. "Balanced Builder", "Steady Saver") and personalized tips
- **Digital Twin Simulation** — Test financial scenarios without touching real data
- **Real-Time Risk Scoring** — Continuous 0-100 risk assessment with flagged events
- **Cross-Account Transfers** — Copy account ID and send money to any user
- **Dark/Light Theme** — Fully themed UI with CSS custom properties
- **FinBot AI Assistant** — Built-in chatbot explaining platform features
- **Protected Routing** — Auth + profile completion guards on all dashboard pages
