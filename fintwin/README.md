# FinTwin AI 🧠💰
**Your Financial Digital Twin — Powered by Google Gemini 2.0 Flash**

FinTwin is a modern, microservices-based financial intelligence platform that helps users take control of their finances through automated bank statement analysis, AI-driven risk scoring, and deep financial projections.

![FinTwin Banner](https://img.shields.io/badge/AI-Gemini_2.0_Flash-blue?style=for-the-badge)
![License](https://img.shields.io/badge/Status-Production_Ready-green?style=for-the-badge)
![Tech](https://img.shields.io/badge/Stack-React_|_FastAPI_|_PostgreSQL-blueviolet?style=for-the-badge)

---

## 🚀 Key Features

### 1. **AI-Powered Deep Analysis**
*   **Zero-Cost Intelligence:** Fully integrated with **Google Gemini 2.0 Flash API** for high-speed, free-tier financial advice.
*   **Feasibility Scoring:** Get a "Gauge Score" on large purchases (e.g., "Can I afford an iPhone?").
*   **Projections:** Visual charts showing your future balance based on current spending habits.

### 2. **Smart Bank Statement Parsing**
*   **Multi-Format Support:** Robust extraction from both **PDF** and **CSV** statements.
*   **Fuzzy Logic Engine:** Automatically recognizes headers from major banks like SBI, HDFC, ICICI, and Axis.
*   **Aggressive Text Extraction:** Can "read" transactions even from PDFs without clear table structures.

### 3. **Secure Infrastructure**
*   **Google OAuth 2.0:** Secure login using your Google account (no passwords stored).
*   **Redis Sessions:** High-performance, server-side session management.
*   **Nginx Gateway:** Centralized routing and SSL termination.

---

## 🛠 Tech Stack

*   **Frontend:** React.js, Vite, Vanilla CSS (Premium Glassmorphism Design)
*   **Backend:** Python (FastAPI), SQLAlchemy
*   **Database:** PostgreSQL (Primary Store), Redis (Session Cache)
*   **AI Engine:** Google Generative AI (Gemini 2.0)
*   **DevOps:** Docker, Docker Compose, Nginx

---

## ⚙️ Setup & Installation

### 1. Prerequisites
*   [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed and running.
*   Google Cloud Console credentials (Client ID & Secret).
*   Google AI Studio API Key (Gemini).

### 2. Environment Configuration
Create a `.env` file in the root directory:

```env
# AI Keys
GEMINI_API_KEY=your_google_gemini_key

# Google OAuth
GOOGLE_CLIENT_ID=your_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_client_secret

# Internal Communication
INTERNAL_KEY=fintwin-internal-2024
```

### 3. Spin up the containers
```bash
docker-compose up -d --build
```
The application will be available at `http://localhost:3000`.

---

## 🏗 Microservices Architecture

| Service | Port | Responsibility |
| :--- | :--- | :--- |
| **Nginx** | 80 | API Gateway & Frontend Server |
| **Frontend** | 3000 | User Dashboard & UI |
| **Account Service** | 8001 | User Profiles & OAuth Flow |
| **Transaction Service** | 8002 | Bank Parsing & DB Management |
| **Risk Service** | 8003 | Gemini AI Integration & Projections |
| **Notification Service** | 8004 | System Alerts & Background Tasks |

---

## 📊 Usage Guide

1.  **Login:** Use the "Sign in with Google" button.
2.  **Upload:** Go to "Upload Statement" and drag your bank PDF/CSV.
3.  **Analyze:** Visit "Risk Analysis" and click **Deep Analysis** to ask the AI about your financial goals.
4.  **History:** View your spending patterns in the transaction history list.

---

## 🛡 Security Note
FinTwin utilizes an **Internal API Key** (`INTERNAL_KEY`) to ensure that microservices can only talk to each other and not to unauthorized external requests.

---

## 📜 License
© 2024 FinTwin Project. Developed for Advanced Financial Analytics.
