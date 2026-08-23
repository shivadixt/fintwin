import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import client from '../api/client';
import RiskBar from '../components/RiskBar';
import { showToast } from '../components/Toast';

const SCENARIO_CONFIG = {
  large_withdrawal: {
    label: 'How much do you want to withdraw? (₹)',
    helper: (amt) => amt ? `We'll simulate removing ₹${formatIndian(amt)} from your virtual balance` : 'Enter a withdrawal amount to simulate',
    isDeduction: true,
    selectLabel: 'Large Withdrawal',
  },
  deposit: {
    label: 'How much do you want to deposit? (₹)',
    helper: (amt) => amt ? `We'll simulate adding ₹${formatIndian(amt)} to your virtual balance` : 'Enter a deposit amount to simulate',
    isDeduction: false,
    selectLabel: 'Large Deposit',
  },
  rate_change: {
    label: 'New interest rate to simulate (%)',
    helper: (amt) => amt ? `We'll apply a ${amt}% rate change to project your balance` : 'Enter an interest rate percentage',
    isDeduction: false,
    selectLabel: 'Interest Rate Change',
  },
  recurring_expense: {
    label: 'Monthly expense amount (₹)',
    helper: (amt) => amt ? `We'll simulate a recurring ₹${formatIndian(amt)}/month expense impact` : 'Enter a monthly expense amount',
    isDeduction: true,
    selectLabel: 'Recurring Expense',
  },
  investment_growth: {
    label: 'Amount to invest (₹)',
    helper: (amt) => amt ? `We'll simulate investing ₹${formatIndian(amt)} and project returns` : 'Enter an investment amount',
    isDeduction: true,
    selectLabel: 'Investment Growth',
  },
  emergency_fund: {
    label: 'Emergency withdrawal amount (₹)',
    helper: (amt) => amt ? `We'll simulate an emergency withdrawal of ₹${formatIndian(amt)}` : 'Enter the emergency withdrawal amount',
    isDeduction: true,
    selectLabel: 'Emergency Fund',
  },
};

function formatIndian(num) {
  const n = parseFloat(num);
  if (isNaN(n)) return '0';
  return n.toLocaleString('en-IN');
}

export default function DigitalTwin() {
  const { user } = useAuth();
  const [balance, setBalance] = useState(null);
  const [balanceLoading, setBalanceLoading] = useState(true);
  const [balanceError, setBalanceError] = useState(false);
  const [scenario, setScenario] = useState('large_withdrawal');
  const [amount, setAmount] = useState('');
  const [amountError, setAmountError] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  // Auto-fetch balance from transactions
  const fetchBalance = async () => {
    if (!user?.id) return;
    setBalanceLoading(true);
    setBalanceError(false);
    try {
      const res = await client.get(`/transactions/account/${user.id}`);
      const txns = res.data || [];
      let computed = 0;
      for (const txn of txns) {
        if (txn.type === 'deposit') {
          computed += txn.amount;
        } else if (txn.type === 'withdrawal') {
          computed -= txn.amount;
        } else if (txn.type === 'transfer') {
          if (txn.to_account === user.id) {
            computed += txn.amount;
          } else {
            computed -= txn.amount;
          }
        }
      }
      setBalance(computed);
    } catch {
      setBalanceError(true);
      setBalance(0);
    } finally {
      setBalanceLoading(false);
    }
  };

  const fetchHistory = async () => {
    if (!user?.id) return;
    try {
      const res = await client.get(`/simulate/history/${user.id}`);
      setHistory(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    fetchBalance();
    fetchHistory();
  }, [user]);

  const config = SCENARIO_CONFIG[scenario] || SCENARIO_CONFIG.large_withdrawal;

  // Validate amount against balance for deduction scenarios
  const validateAmount = (val) => {
    const num = parseFloat(val);
    if (!val || isNaN(num) || num <= 0) {
      setAmountError('');
      return;
    }
    if (config.isDeduction && balance !== null && num > balance) {
      setAmountError(`Amount exceeds your balance of ₹${formatIndian(balance)}`);
    } else {
      setAmountError('');
    }
  };

  const handleAmountChange = (e) => {
    const val = e.target.value;
    setAmount(val);
    validateAmount(val);
  };

  // Re-validate when scenario changes
  useEffect(() => {
    validateAmount(amount);
  }, [scenario]);

  const handleSimulate = async (e) => {
    e.preventDefault();
    if (amountError) return;
    setLoading(true);
    setResult(null);
    try {
      // Map new scenario names to what the backend expects
      const backendScenario = scenario === 'large_withdrawal' ? 'withdrawal' : scenario;
      const res = await client.post('/simulate/', {
        account_id: user?.id || 'user',
        scenario: backendScenario,
        amount: parseFloat(amount),
        balance: balance ?? 0,
      });
      setResult(res.data);
      showToast('Simulation complete');
      fetchHistory();
    } catch (err) {
      showToast(err.response?.data?.detail || 'Simulation failed');
    } finally {
      setLoading(false);
    }
  };

  const handleClearHistory = async () => {
    if (!user?.id) return;
    if (!confirm('Are you sure you want to clear all simulation history?')) return;
    try {
      await client.delete(`/simulate/history/${user.id}`);
      showToast('Simulation history cleared');
      fetchHistory();
    } catch (err) {
      showToast('Failed to clear history');
    }
  };

  const handleDeleteSimulation = async (id) => {
    try {
      await client.delete(`/simulate/history/detail/${id}`);
      showToast('Simulation deleted');
      fetchHistory();
    } catch (err) {
      showToast('Failed to delete simulation');
    }
  };

  const formatCurrency = (v) => `₹${parseFloat(v).toLocaleString('en-IN')}`;

  const formatTime = (ts) => {
    if (!ts) return '—';
    const d = new Date(ts);
    return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Digital Twin</h1>
      </div>

      <div className="two-col">
        <div className="card">
          <div className="card-header">
            <span className="card-title">Configure Simulation</span>
          </div>

          {/* Auto-fetched Balance Display */}
          {balanceLoading ? (
            <div style={{
              padding: '20px',
              background: 'var(--surface2)',
              borderRadius: 'var(--radius-sm)',
              marginBottom: 16,
            }}>
              <div style={{ width: 120, height: 12, background: 'var(--border)', borderRadius: 4, marginBottom: 10, animation: 'pulse 1.5s infinite' }} />
              <div style={{ width: 180, height: 24, background: 'var(--border)', borderRadius: 4, animation: 'pulse 1.5s infinite' }} />
            </div>
          ) : balanceError ? (
            <div style={{
              padding: '16px 20px',
              background: 'var(--red-bg)',
              borderRadius: 'var(--radius-sm)',
              marginBottom: 16,
              fontSize: 13,
              color: 'var(--red)',
            }}>
              ⚠️ Could not load balance. Please refresh.
            </div>
          ) : (
            <div style={{
              padding: '16px 20px',
              background: 'linear-gradient(135deg, var(--surface2), var(--surface))',
              border: '1px solid var(--green)',
              borderRadius: 'var(--radius-sm)',
              marginBottom: 16,
            }}>
              <div style={{ fontSize: 12, color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: 6 }}>
                💰 Your Current Balance
              </div>
              <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--green)', fontFamily: 'var(--font-mono)' }}>
                ₹{formatIndian(balance)}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>
                Used automatically in simulation
              </div>
            </div>
          )}

          <form onSubmit={handleSimulate}>
            <div className="form-group">
              <label className="form-label">Scenario</label>
              <select className="form-select" value={scenario} onChange={e => setScenario(e.target.value)}>
                {Object.entries(SCENARIO_CONFIG).map(([key, cfg]) => (
                  <option key={key} value={key}>{cfg.selectLabel}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">{config.label}</label>
              <input
                className={`form-input ${amountError ? 'input-error' : ''}`}
                type="number"
                value={amount}
                onChange={handleAmountChange}
                placeholder="Enter amount..."
                required
                min="0"
                step="any"
              />
              {amountError && <span className="field-error">{amountError}</span>}
              <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text3)', fontStyle: 'italic' }}>
                {config.helper(amount)}
              </div>
            </div>

            <button className="btn btn-blue btn-full" type="submit" disabled={loading || !!amountError || balanceLoading}>
              {loading ? 'Running…' : 'Run Simulation'}
            </button>
          </form>
        </div>

        <div className="card">
          <div className="card-header">
            <span className="card-title">Simulation Result</span>
          </div>
          {!result ? (
            <div style={{ color: 'var(--text3)', fontSize: 13, padding: '40px 0', textAlign: 'center' }}>
              Configure and run a simulation to see results
            </div>
          ) : (
            <div className="sim-result">
              <div className="sim-balance-row">
                <div className="sim-balance-box before">
                  <div className="sim-balance-label">Current Balance</div>
                  <div className="sim-balance-value">{formatCurrency(result.current_balance)}</div>
                </div>
                <div className="sim-arrow">→</div>
                <div className="sim-balance-box after">
                  <div className="sim-balance-label">Virtual Balance</div>
                  <div className="sim-balance-value">{formatCurrency(result.virtual_balance)}</div>
                </div>
              </div>

              <div className="sim-risk-label">Risk Score: {result.risk_score}/100</div>
              <RiskBar score={result.risk_score} />

              {result.flags.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  {result.flags.map((f, i) => (
                    <div key={i} style={{ fontSize: 12, color: 'var(--red)', marginBottom: 4 }}>⚠ {f}</div>
                  ))}
                </div>
              )}

              <div className={`sim-alert ${result.alert_level}`}>
                {result.recommendation}
              </div>

              <div className="sim-note">
                Simulation ran on virtual twin. Real data unchanged.
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Simulation History */}
      <div className="card" style={{ marginTop: 4 }}>
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="card-title">Simulation History</span>
          {history.length > 0 && (
            <button className="btn btn-outline" style={{ fontSize: 12, padding: '4px 10px', color: 'var(--red)', borderColor: 'var(--red)' }} onClick={handleClearHistory}>
              Clear All
            </button>
          )}
        </div>
        {historyLoading ? (
          <div style={{ color: 'var(--text3)', fontSize: 13, padding: 20, textAlign: 'center' }}>Loading…</div>
        ) : history.length === 0 ? (
          <div style={{ color: 'var(--text3)', fontSize: 13, padding: '30px 0', textAlign: 'center' }}>
            No simulations yet. Run your first one above.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Date', 'Scenario', 'Amount', 'Before', 'After', 'Risk Score', 'Alert', 'Actions'].map(h => (
                    <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: 'var(--text2)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.3px' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {history.map(sim => (
                  <tr key={sim.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '10px 12px', color: 'var(--text3)', fontSize: 12 }}>{formatTime(sim.created_at)}</td>
                    <td style={{ padding: '10px 12px', textTransform: 'capitalize' }}>{sim.scenario.replace('_', ' ')}</td>
                    <td style={{ padding: '10px 12px' }}>{formatCurrency(sim.amount)}</td>
                    <td style={{ padding: '10px 12px' }}>{formatCurrency(sim.before_balance)}</td>
                    <td style={{ padding: '10px 12px' }}>{formatCurrency(sim.after_balance)}</td>
                    <td style={{ padding: '10px 12px', fontWeight: 600 }}>{sim.risk_score}/100</td>
                    <td style={{ padding: '10px 12px' }}>
                      <span className={`badge ${sim.alert_level === 'low' ? 'green' : sim.alert_level === 'medium' ? 'amber' : 'red'}`}>
                        {sim.alert_level}
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <button className="btn btn-outline" style={{ padding: '2px 6px', fontSize: 11, color: 'var(--red)' }} onClick={() => handleDeleteSimulation(sim.id)}>
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
