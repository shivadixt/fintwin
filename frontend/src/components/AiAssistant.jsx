import { useState, useRef, useEffect } from "react"

const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY

const SYSTEM_PROMPT = `You are FinBot, an AI assistant built into FinTwin — a Scalable Financial Digital Twin System. You help users understand the platform, their finances, and how everything works.

ABOUT FINTWIN:
FinTwin is a microservices-based financial platform that creates a "digital twin" — a virtual copy of your real financial state. You can simulate what-if scenarios (like "what happens if I withdraw ₹80,000?") without touching real data.

THE SERVICES:
- Account Service: manages user accounts and balances
- Transaction Service: handles deposits, withdrawals, and transfers
- Digital Twin Engine: runs financial simulations on a virtual copy of your data
- Risk Analysis Service: scores your account 0-100 based on activity patterns
- Notification Service: alerts you when risk thresholds are exceeded

TRANSACTIONS:
- Deposit: adds money to your account, balance increases
- Withdrawal: removes money, balance decreases
- Transfer: moves money between accounts — source decreases, destination increases
- All transactions are recorded permanently with a UUID and timestamp

RISK SCORES (0-100):
- 0–30 = Low risk (green) — normal activity
- 31–60 = Medium risk (yellow) — some unusual patterns detected
- 61–100 = High risk (red) — urgent attention needed
Risk goes up when: a single transaction exceeds 50% of your balance (+20 pts), 3+ transactions in 60 minutes (+15 pts), balance below ₹50,000 (+10 pts), negative balance/overdraft (+25 pts).

DIGITAL TWIN / SIMULATION:
The simulate feature lets you test scenarios without touching real data. Example: "What if I withdraw ₹80,000?" — the Twin Engine fetches your real balance, creates a virtual copy in memory, applies the withdrawal math, calculates the resulting risk score, and returns the outcome. Your real account is untouched.

HOW TO USE THE APP:
- Login with your email and password to get a JWT token
- Dashboard shows your total balance, recent transactions, and current risk score
- Accounts page: view and manage your accounts
- Transactions page: post deposits, withdrawals, transfers
- Digital Twin page: run what-if simulations
- Risk Analysis page: see your full risk breakdown and flags

TECHNICAL (for curious users):
- Built with FastAPI (Python) backend, React frontend, PostgreSQL database
- Services communicate via REST APIs through an Nginx gateway
- Authentication uses JWT tokens (expire after session ends)
- Docker containers run all services together

RULES:
- Only answer questions related to FinTwin, personal finance basics, or how to use the app
- If asked about unrelated topics, politely redirect to FinTwin topics
- Keep answers concise and helpful
- Use ₹ for currency in examples`

export default function AiAssistant() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState([
    { role: "assistant", content: "Hi! I'm FinBot 👋 I can help you understand your transactions, risk scores, simulations, or anything about FinTwin. What would you like to know?" }
  ])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, open])

  async function send() {
    const text = input.trim()
    if (!text || loading) return

    const userMsg = { role: "user", content: text }
    setMessages(prev => [...prev, userMsg])
    setInput("")
    setLoading(true)

    try {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${GROQ_API_KEY}`
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            ...messages.slice(-8),  // keep last 8 messages for context
            userMsg
          ],
          max_tokens: 400,
          temperature: 0.5
        })
      })

      const data = await res.json()
      const reply = data.choices?.[0]?.message?.content || "Sorry, I couldn't get a response. Try again."
      setMessages(prev => [...prev, { role: "assistant", content: reply }])
    } catch {
      setMessages(prev => [...prev, { role: "assistant", content: "Connection error. Please try again." }])
    } finally {
      setLoading(false)
    }
  }

  function handleKey(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  return (
    <>
      {/* Popup */}
      {open && (
        <div style={{
          position: "fixed", bottom: "80px", right: "24px",
          width: "340px", height: "480px",
          background: "var(--bg, #fff)",
          border: "1px solid var(--border, #e5e7eb)",
          borderRadius: "16px",
          boxShadow: "0 8px 32px rgba(0,0,0,0.15)",
          display: "flex", flexDirection: "column",
          zIndex: 1000, overflow: "hidden"
        }}>
          {/* Header */}
          <div style={{
            padding: "14px 16px",
            background: "#1D9E75",
            color: "#fff",
            display: "flex", alignItems: "center", justifyContent: "space-between"
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <div style={{
                width: "32px", height: "32px", borderRadius: "50%",
                background: "rgba(255,255,255,0.2)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "16px"
              }}>🤖</div>
              <div>
                <div style={{ fontWeight: 600, fontSize: "14px" }}>FinBot</div>
                <div style={{ fontSize: "11px", opacity: 0.85 }}>FinTwin AI Assistant</div>
              </div>
            </div>
            <button onClick={() => setOpen(false)} style={{
              background: "none", border: "none", color: "#fff",
              cursor: "pointer", fontSize: "18px", lineHeight: 1
            }}>×</button>
          </div>

          {/* Messages */}
          <div style={{
            flex: 1, overflowY: "auto", padding: "12px",
            display: "flex", flexDirection: "column", gap: "10px"
          }}>
            {messages.map((msg, i) => (
              <div key={i} style={{
                display: "flex",
                justifyContent: msg.role === "user" ? "flex-end" : "flex-start"
              }}>
                <div style={{
                  maxWidth: "80%",
                  padding: "9px 13px",
                  borderRadius: msg.role === "user" ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
                  background: msg.role === "user" ? "#1D9E75" : "var(--surface, #f3f4f6)",
                  color: msg.role === "user" ? "#fff" : "var(--text, #111)",
                  fontSize: "13px", lineHeight: "1.5"
                }}>
                  {msg.content}
                </div>
              </div>
            ))}
            {loading && (
              <div style={{ display: "flex", justifyContent: "flex-start" }}>
                <div style={{
                  padding: "9px 14px", borderRadius: "16px 16px 16px 4px",
                  background: "var(--surface, #f3f4f6)",
                  fontSize: "18px", letterSpacing: "2px"
                }}>
                  <span style={{ animation: "pulse 1s infinite" }}>···</span>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div style={{
            padding: "10px 12px",
            borderTop: "1px solid var(--border, #e5e7eb)",
            display: "flex", gap: "8px"
          }}>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Ask about FinTwin..."
              style={{
                flex: 1, padding: "8px 12px",
                border: "1px solid var(--border, #d1d5db)",
                borderRadius: "20px", fontSize: "13px",
                outline: "none", background: "transparent",
                color: "var(--text, #111)"
              }}
            />
            <button onClick={send} disabled={loading || !input.trim()} style={{
              width: "36px", height: "36px", borderRadius: "50%",
              background: input.trim() && !loading ? "#1D9E75" : "#d1d5db",
              border: "none", cursor: input.trim() && !loading ? "pointer" : "default",
              color: "#fff", fontSize: "16px",
              display: "flex", alignItems: "center", justifyContent: "center"
            }}>→</button>
          </div>
        </div>
      )}

      {/* Toggle Button */}
      <button onClick={() => setOpen(prev => !prev)} style={{
        position: "fixed", bottom: "24px", right: "24px",
        width: "52px", height: "52px", borderRadius: "50%",
        background: "#1D9E75", border: "none",
        boxShadow: "0 4px 16px rgba(29,158,117,0.4)",
        cursor: "pointer", fontSize: "22px", color: "#fff",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 1001
      }}>
        {open ? "×" : "🤖"}
      </button>
    </>
  )
}
