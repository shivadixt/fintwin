# FinTwin Project Status & Roadmap

This document outlines the architecture, the features established in the FinTwin platform, and the pending roadmap items as we shift towards a fully mature production build. 

## ✅ What is Completed

### Core Architecture & Infrastructure
- **Containerized Network Layer**: Full orchestrator running 7+ independent microservices interlinked via Docker networks.
- **Nginx API Gateway**: Proxies all frontend traffic securely to the appropriate backend containers (`/api/*`).
- **Postgres Database**: Primary persistent storage successfully logging transactional and simulation event data.
- **Redis Cache Layer**: Used for tracking system-wide states and accelerating high-frequency API responses.

### Developed Microservices
1. **Account Service**: Manages User Registration (JWT issuing) and core balance indexing.
2. **Transaction Service**: Records ledger events and triggers conditional downstream dependencies.
3. **Risk Service / ML Engine**: Utilizes an Isolation Forest machine learning model dynamically scoring risk/anomalies behind the scenes. 
4. **Twin Service**: Hosts the **AI Financial Planner** engine, pulling combined ledger balances and portfolio holdings to simulate hypothetical chat outcomes.
5. **Portfolio Service**: Tracks long-term asset valuation schemas representing a user's holdings.
6. **Notification Service**: Centralized internal hub tracking real-time events and displaying them to the frontend.
7. **Gmail Watcher Service**: (New) End-to-end watcher polling an inbox, running Claude 3.5 Sonnet to exact-parse financial receipts, and injecting the result entirely autonomously through the internal FinTwin mesh.

### Internal Security Enhancements
- All server-to-server endpoints (such as `gmail-watcher` triggering the `transaction-service`) are secured directly via `X-Internal-Key` (`fintwin-internal-2024`) allowing secure internal execution without leaking sensitive user JWT states.

---

## 🚧 What is Remaining (Future Roadmap)

While the functionality of the system is rock-solid locally, these are the key scaling areas we face next:

### 1. Robust Queue Implementation (RabbitMQ / Celery)
- **Current State**: Internal tasks (like Twin refreshes, heavy email processing) are running as `asyncio.create_task()` background jobs.
- **Goal**: Implement a message broker (RabbitMQ/Redis Streams) to queue tasks so they don't break if a microservice abruptly restarts mid-operation.

### 2. External Integration Pipelines
- **Current State**: We rely heavily on Gmail Receipt parsing for outside transactions. 
- **Goal**: Hook into Open Banking protocols (like **Plaid API** or **Stripe**) so the `transaction-service` automatically indexes true bank statement histories via Oauth protocols rather than email relays.

### 3. ML Model Optimization Pipeline (Continuous Learning)
- **Current State**: The Isolation Forest flags anomalies correctly but assumes a fairly strict variance.
- **Goal**: Add a `CRON` job that wakes up nightly to fetch the daily updated normal transaction flow, dropping that payload back into `scikit-learn` to continuously retrain and rebalance the Isolation Forest baseline.

### 4. CI/CD & Cloud Deployment Pipelines
- **Current State**: Docker Compose runs brilliantly on Localhost in Windows.
- **Goal**: Move away from localhost into production:
    - Host the FastAPI clusters on AWS ECS / EKS or Google Cloud Run.
    - Deploy the Vite/React UI globally via Vercel or AWS Amplify.
    - Automate github `.yml` deployment actions to run integration tests using `pytest` natively prior to code rollouts.

### 5. Notification Service Hardening 
- **Current State**: Generates flags correctly.
- **Goal**: Bind the Notification backend heavily into WebSocket (or SSE) configurations so the frontend React app automatically updates its notification bubble the second the UI is active, avoiding the need for heavy API polling intervals. 
