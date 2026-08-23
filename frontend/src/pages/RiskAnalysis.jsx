import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import client from '../api/client';

export default function RiskAnalysis() {
  const { user } = useAuth();
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [lastChecked, setLastChecked] = useState(new Date());
  
  const [balance, setBalance] = useState(0);
  const [score, setScore] = useState(0);
  const [flags, setFlags] = useState([]);

  // Format currency
  const formatIndian = (num) => {
    const n = parseFloat(num);
    if (isNaN(n)) return '0';
    return n.toLocaleString('en-IN');
  };

  const runHealthCheck = async () => {
    if (!user?.id) return;
    
    setLoading(true);
    setError(false);
    
    try {
      // 1. Fetch transactions to calculate balance
      let currentBalance = 0;
      let txns = [];
      try {
        const txnRes = await client.get(`/transactions/account/${user.id}`);
        txns = txnRes.data || [];
        
        for (const txn of txns) {
          if (txn.type === 'deposit') {
            currentBalance += txn.amount;
          } else if (txn.type === 'withdrawal') {
            currentBalance -= txn.amount;
          } else if (txn.type === 'transfer') {
            if (txn.to_account === user.id) {
              currentBalance += txn.amount;
            } else {
              currentBalance -= txn.amount;
            }
          }
        }
        setBalance(currentBalance);
      } catch (err) {
        console.error("Failed to fetch transactions", err);
      }

      // 2. Run Analysis
      await client.post('/risk/analyze', {
        account_id: user.id,
        current_balance: currentBalance,
        recent_transactions: txns,
      });

      // 3. Fetch Score
      const scoreRes = await client.get(`/risk/score/${user.id}`);
      setScore(scoreRes.data.score || 0);
      setFlags(scoreRes.data.flags || []);
      
      setLastChecked(new Date());

    } catch (err) {
      console.error(err);
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    runHealthCheck();
  }, [user]);

  // Status mapping based on score
  let statusColor = 'green';
  let statusIcon = '🟢';
  let statusTitle = 'Your account looks healthy';
  let statusSubtitle = 'No unusual activity detected';
  let balanceStatus = 'Healthy';
  let activityStatus = 'Normal';
  let unusualStatus = 'Clear';

  if (score >= 70) {
    statusColor = 'red';
    statusIcon = '🔴';
    statusTitle = 'Action recommended';
    statusSubtitle = 'We found activity that needs your attention';
    balanceStatus = balance < 0 ? 'Critical' : 'Low';
    activityStatus = 'High';
    unusualStatus = 'Review Needed';
  } else if (score >= 40) {
    statusColor = 'amber';
    statusIcon = '🟡';
    statusTitle = 'Some things need your attention';
    statusSubtitle = 'We spotted a few things worth reviewing';
    balanceStatus = balance < 50000 ? 'Low' : 'Healthy';
    activityStatus = 'Elevated';
    unusualStatus = flags.length > 0 ? 'Review Needed' : 'Clear';
  }

  // Helper to translate flags to plain English
  const translateFlag = (flag) => {
    const f = flag.toLowerCase();
    
    if (f.includes('ml anomaly') || f.includes('isolation forest')) {
      return {
        title: 'Unusual Activity Detected',
        desc: 'We noticed a transaction pattern that is different from your usual habits.',
        tip: 'Review your recent transactions to ensure you recognize them.',
        severity: 'orange',
        label: 'Worth reviewing'
      };
    }
    
    if (f.includes('exceeds 50%') || f.includes('large transaction')) {
      return {
        title: 'Unusually Large Transaction',
        desc: 'A recent transaction moved a significant portion of your total balance.',
        tip: 'Large movements are fine if planned. Verify the amount is correct.',
        severity: 'orange',
        label: 'Worth reviewing'
      };
    }
    
    if (f.includes('high frequency')) {
      return {
        title: 'Many Recent Transfers',
        desc: 'You made several transactions in a very short period of time.',
        tip: 'If this was you, no action is needed. Otherwise, secure your account.',
        severity: 'orange',
        label: 'Worth reviewing'
      };
    }
    
    if (f.includes('low balance')) {
      return {
        title: 'Low Balance Warning',
        desc: 'Your balance is lower than the recommended minimum of ₹50,000.',
        tip: 'Consider adding funds to avoid potential overdrafts or missed payments.',
        severity: 'green',
        label: 'Just a heads up'
      };
    }
    
    if (f.includes('overdrawn')) {
      return {
        title: 'Account Overdrawn',
        desc: 'Your account balance is currently negative.',
        tip: 'Add funds immediately to restore your account to a healthy state.',
        severity: 'red',
        label: 'Needs attention'
      };
    }

    // Fallback
    return {
      title: 'Automated Check',
      desc: flag,
      tip: 'Review this item for your own awareness.',
      severity: 'orange',
      label: 'Worth reviewing'
    };
  };

  const getTimeAgo = () => {
    const mins = Math.floor((new Date() - lastChecked) / 60000);
    if (mins === 0) return 'Just now';
    if (mins === 1) return '1 minute ago';
    return `${mins} minutes ago`;
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '100px 20px', color: 'var(--text2)' }}>
        <div style={{ width: 40, height: 40, border: '3px solid var(--border)', borderTopColor: 'var(--blue)', borderRadius: '50%', animation: 'spin 1s linear infinite', marginBottom: 16 }}></div>
        <div style={{ fontSize: 16, fontWeight: 500 }}>🔍 Checking your account...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '60px 20px', textAlign: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>⚠️</div>
        <h2 style={{ fontSize: 20, marginBottom: 8, color: 'var(--text)' }}>Couldn't load your account check</h2>
        <p style={{ color: 'var(--text3)', marginBottom: 24 }}>There was a problem connecting to the health service.</p>
        <button className="btn btn-primary" onClick={runHealthCheck}>Try Again</button>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Account Health Check</h1>
      </div>

      {/* SECTION 1 — HEALTH STATUS BANNER */}
      <div style={{ 
        background: `var(--${statusColor}-bg)`, 
        border: `1px solid var(--${statusColor}2)`,
        borderRadius: 'var(--radius)',
        padding: '24px',
        marginBottom: '24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '16px'
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
          <div style={{ fontSize: '32px', lineHeight: 1 }}>{statusIcon}</div>
          <div>
            <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text)', marginBottom: '4px' }}>
              {statusTitle}
            </div>
            <div style={{ fontSize: '14px', color: 'var(--text2)' }}>
              {statusSubtitle}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text3)', marginTop: '8px' }}>
              Last checked: {getTimeAgo()} <span style={{ opacity: 0.7 }}>(Auto-updated on page load)</span>
            </div>
          </div>
        </div>
        <button 
          className="btn btn-outline" 
          onClick={runHealthCheck}
          style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
        >
          Re-run ↺
        </button>
      </div>

      {/* SECTION 2 — TWO COLUMNS */}
      <div className="two-col" style={{ marginBottom: '24px' }}>
        
        {/* LEFT CARD — What we checked */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">🔍 Account Summary</span>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {/* Row 1 */}
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)' }}>💰 Balance Status</div>
                <div style={{ fontSize: '13px', color: 'var(--text3)', marginTop: '2px' }}>Your balance is ₹{formatIndian(balance)}</div>
              </div>
              <div className={`badge ${balanceStatus === 'Healthy' ? 'green' : balanceStatus === 'Low' ? 'amber' : 'red'}`}>
                {balanceStatus}
              </div>
            </div>

            {/* Row 2 */}
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)' }}>⚡ Recent Activity</div>
                <div style={{ fontSize: '13px', color: 'var(--text3)', marginTop: '2px' }}>Transaction volume review</div>
              </div>
              <div className={`badge ${activityStatus === 'Normal' ? 'green' : activityStatus === 'Elevated' ? 'amber' : 'red'}`}>
                {activityStatus}
              </div>
            </div>

            {/* Row 3 */}
            <div style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)' }}>🚨 Unusual Activity</div>
                <div style={{ fontSize: '13px', color: 'var(--text3)', marginTop: '2px' }}>
                  {flags.length === 0 ? 'No unusual patterns found' : `${flags.length} unusual items flagged`}
                </div>
              </div>
              <div className={`badge ${unusualStatus === 'Clear' ? 'green' : 'amber'}`}>
                {unusualStatus}
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT CARD — Things to review */}
        <div className="card">
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="card-title">⚠️ Things to Review</span>
            {flags.length > 0 && <div className="badge amber">{flags.length} items</div>}
          </div>

          {flags.length === 0 ? (
            <div style={{ padding: '40px 20px', textAlign: 'center' }}>
              <div style={{ fontSize: '48px', marginBottom: '16px' }}>✅</div>
              <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text)' }}>Everything looks normal!</div>
              <div style={{ fontSize: '14px', color: 'var(--text3)', marginTop: '8px' }}>We didn't find anything that needs your attention.</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {flags.map((flagRaw, i) => {
                const info = translateFlag(flagRaw);
                return (
                  <div key={i} style={{ padding: '16px 20px', borderBottom: i < flags.length - 1 ? '1px solid var(--border)' : 'none' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                      <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)' }}>{info.title}</div>
                      <div className={`badge ${info.severity}`} style={{ fontSize: '10px' }}>{info.label.toUpperCase()}</div>
                    </div>
                    <div style={{ fontSize: '13px', color: 'var(--text2)', marginBottom: '8px', lineHeight: 1.4 }}>
                      {info.desc}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text3)', background: 'var(--surface2)', padding: '8px 12px', borderRadius: '4px' }}>
                      💡 {info.tip}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* SECTION 3 — What you can do */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">💡 Simple Steps to Improve</span>
        </div>
        <div style={{ padding: '20px' }}>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '16px' }}>
            
            {score < 40 && (
              <>
                <li style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                  <span style={{ fontSize: '18px' }}>✅</span>
                  <div>
                    <div style={{ fontSize: '15px', color: 'var(--text)', fontWeight: 500 }}>Your account is in great shape — keep it up!</div>
                  </div>
                </li>
                <li style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                  <span style={{ fontSize: '18px' }}>💰</span>
                  <div>
                    <div style={{ fontSize: '15px', color: 'var(--text)', fontWeight: 500 }}>Consider setting up auto-savings for surplus balance</div>
                  </div>
                </li>
                <li style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                  <span style={{ fontSize: '18px' }}>📊</span>
                  <div>
                    <div style={{ fontSize: '15px', color: 'var(--text)', fontWeight: 500 }}>Review your portfolio in the Portfolio section</div>
                  </div>
                </li>
              </>
            )}

            {score >= 40 && score < 70 && (
              <>
                <li style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                  <span style={{ fontSize: '18px' }}>👀</span>
                  <div>
                    <div style={{ fontSize: '15px', color: 'var(--text)', fontWeight: 500 }}>Review your recent large transactions</div>
                  </div>
                </li>
                <li style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                  <span style={{ fontSize: '18px' }}>⏱️</span>
                  <div>
                    <div style={{ fontSize: '15px', color: 'var(--text)', fontWeight: 500 }}>Try to spread transfers over time instead of all at once</div>
                  </div>
                </li>
                <li style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                  <span style={{ fontSize: '18px' }}>💰</span>
                  <div>
                    <div style={{ fontSize: '15px', color: 'var(--text)', fontWeight: 500 }}>Keep your balance above a comfortable minimum</div>
                  </div>
                </li>
              </>
            )}

            {score >= 70 && (
              <>
                <li style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                  <span style={{ fontSize: '18px' }}>🚫</span>
                  <div>
                    <div style={{ fontSize: '15px', color: 'var(--text)', fontWeight: 500 }}>Avoid large withdrawals until activity normalizes</div>
                  </div>
                </li>
                <li style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                  <span style={{ fontSize: '18px' }}>🔍</span>
                  <div>
                    <div style={{ fontSize: '15px', color: 'var(--text)', fontWeight: 500 }}>Check your recent transactions for anything unfamiliar</div>
                  </div>
                </li>
                <li style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                  <span style={{ fontSize: '18px' }}>📞</span>
                  <div>
                    <div style={{ fontSize: '15px', color: 'var(--text)', fontWeight: 500 }}>If something looks wrong, contact support immediately</div>
                  </div>
                </li>
              </>
            )}

          </ul>
        </div>
      </div>

    </div>
  );
}
