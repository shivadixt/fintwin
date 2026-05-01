# FinTwin: Project Overview & Status Report

FinTwin is a modern, fully-isolated, multi-tenant financial architecture that allows users to manage their live accounts, track real-time transactions, and run "Digital Twin" simulations against their state without modifying live data.

## ✅ What Has Been Done & What is Working

The system is currently fully functional in a local development environment. The core loop of registering a user, logging transactions, running ML risk analysis, generating AI financial plans, and displaying it securely on a React frontend is complete.

### 1. Core Infrastructure & Networking
- **Containerized Mesh:** The entire application runs on 7+ independent microservices, seamlessly orchestrated via Docker Compose.
- **API Gateway:** An Nginx reverse proxy routes all frontend traffic securely to the appropriate backend containers (`/api/*`).
- **Data Persistence & Caching:** PostgreSQL is used as the primary database, while Redis handles high-speed volatile caching.

### 2. Microservice Ecosystem
- **Account Service:** Manages user registration, JWT generation, secure credential hashing, and balance tracking.
- **Transaction Service:** Records ledger events (deposits, withdrawals, transfers) with strict database-level filtering ensuring users can only interact with their own funds.
- **Risk Service (ML Engine):** Continuously analyzes transaction velocity and behavior using a Scikit-Learn **Isolation Forest** model to dynamically score risk and detect anomalies.
- **Twin Service (AI Engine):** The core "Digital Twin" engine. It allows running hypothetical financial scenarios (like testing the impact of massive withdrawals) on duplicate temporary states. It also hosts the **AI Financial Planner** which provides advice based on the user's actual ledger balances.
- **Portfolio Service:** Aggregates user accounts and transaction data to present a holistic, long-term view of their wealth.
- **Notification Service:** A centralized hub that tracks real-time events across the system (e.g., a flagged anomaly) and delivers user-specific alerts to the frontend.
- **Gmail Watcher Service:** An autonomous background service that polls an inbox, uses **Claude 3.5 Sonnet** to parse complex financial receipts, and automatically injects those transactions into the system.

### 3. Security & Multi-Tenancy
- **Zero-Trust Philosophy:** Data leakage is prevented at the backend query layer.
- **Internal Authentication:** Server-to-server endpoints communicate securely via an `X-Internal-Key`.
- **User Authentication:** All user-facing endpoints demand cryptographically signed JWTs, securely tying requests to the user's inherent identity.

### 4. Frontend Dashboard
- A complete **React 18 / Vite** single-page application.
- Features context-aware custom Vanilla CSS styling with both dark and light modes.
- Proxies API requests to the backend securely.

---

## 🛠️ Tools & Technology Stack

FinTwin utilizes a robust, modern technology stack broken down into the following layers:

### Backend (Python 3.11+)
- **Framework:** FastAPI (High-performance API framework)
- **Server:** Uvicorn (ASGI Server)
- **Database ORM:** SQLAlchemy
- **Database Driver:** Psycopg2 (for PostgreSQL)
- **Authentication:** Passlib (Bcrypt hashing), Python-JOSE (JWT Generation & Decoding)
- **Data Validation:** Pydantic
- **Internal Comms:** HTTPX (for server-to-server HTTP requests)
- **Caching:** Redis `redis-py` client

### Frontend (Node.js)
- **Framework:** React (^18.2.0) & React-DOM
- **Build Tool:** Vite (^5.0.8)
- **HTTP Client:** Axios (^1.6.2)
- **Styling:** Vanilla CSS

### Infrastructure & Deployment
- **Containerization:** Docker & Docker Compose
- **Web Server / Gateway:** Nginx (`nginx:latest`)
- **Database:** PostgreSQL (`postgres:15`)
- **Cache:** Redis (`redis:7-alpine`)

### Artificial Intelligence & Machine Learning
- **Anomaly Detection:** Scikit-Learn (Isolation Forest algorithm)
- **Receipt Parsing / NLP:** Anthropic API (Claude 3.5 Sonnet)
- **Financial Planner / Chat:** Google Gemini API
