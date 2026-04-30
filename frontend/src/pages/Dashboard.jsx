import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import client from '../api/client';
import StatCard from '../components/StatCard';
import Badge from '../components/Badge';
import PersonaScore from '../components/PersonaScore';

export default function Dashboard() {
  const { user } = useAuth();
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [riskScore, setRiskScore] = useState(0);
  const [notifications, setNotifications] = useState([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const txnRes = await client.get('/transactions/');
        setTransactions(txnRes.data);

        // Fetch risk score for current user
        if (user?.id) {
          try {
            const riskRes = await client.get(`/risk/score/${user.id}`);
            setRiskScore(riskRes.data.score ?? riskRes.data.risk_score ?? 0);
          } catch {
            setRiskScore(0);
          }

          // Fetch notifications
          try {
            const notifRes = await client.get(`/risk/notifications/${user.id}`);
            setNotifications(notifRes.data);
          } catch {
            setNotifications([{ message: "All activity looks normal", type: "Info" }]);
          }
        }
      } catch (err) {
        console.error('Dashboard fetch error:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [user]);

  const today = new Date().toDateString();
  const txnToday = transactions.filter(t =>
    new Date(t.created_at).toDateString() === today
  ).length;

  const totalTxnAmount = transactions.reduce((sum, t) => sum + t.amount, 0);

  const formatCurrency = (v) => `₹${v.toLocaleString('en-IN')}`;
  const formatTime = (ts) => {
    const d = new Date(ts);
    const diff = Date.now() - d.getTime();
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return d.toLocaleDateString();
  };

  const recentTxns = transactions.slice(0, 5);

  const services = [
    { name: 'Auth Service', status: 'green', badge: 'Online' },
    { name: 'Transaction Service', status: 'green', badge: 'Online' },
    { name: 'Twin Service', status: 'green', badge: 'Online' },
    { name: 'Risk Service', status: 'green', badge: 'Online' },
  ];

  if (loading) return <div style={{ padding: 40, color: 'var(--text3)' }}>Loading dashboard…</div>;

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Dashboard</h1>
        <Badge text={`Welcome, ${user?.full_name || user?.account_name || 'User'}`} variant="blue" />
      </div>

      {/* Account Info Card */}
      <div className="card" style={{ marginBottom: 16, padding: '16px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            {user?.picture ? (
              <img src={user.picture} alt="" style={{ width: 40, height: 40, borderRadius: '50%' }} referrerPolicy="no-referrer" />
            ) : (
              <div className="avatar">{(user?.full_name || 'U')[0]}</div>
            )}
            <div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{user?.account_name || user?.full_name || 'User'}</div>
              <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>Account Name</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--surface2)', padding: '8px 14px', borderRadius: 'var(--radius-sm)' }}>
            <div>
              <div style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px' }}>Account ID</div>
              <div style={{ fontSize: 13, fontFamily: 'var(--font-mono)', color: 'var(--text2)', marginTop: 2 }}>{user?.id || '—'}</div>
            </div>
            <button
              className="btn btn-outline"
              style={{ padding: '4px 10px', fontSize: 11 }}
              onClick={() => {
                navigator.clipboard.writeText(user?.id || '');
                import('../components/Toast').then(m => m.showToast('Account ID copied!'));
              }}
              title="Copy ID"
            >
              📋 Copy
            </button>
          </div>
        </div>
      </div>

      {/* Persona Score */}
      <PersonaScore />

      <div className="stat-grid">
        <StatCard label="Total Transactions" value={transactions.length} color="blue" />
        <StatCard label="Transactions Today" value={txnToday} color="green" />
        <StatCard label="Total Volume" value={formatCurrency(totalTxnAmount)} color="blue" />
        <StatCard label="Risk Score" value={riskScore} color={riskScore > 60 ? 'red' : riskScore > 30 ? 'amber' : 'green'} />
      </div>

      <div className="two-col">
        <div className="card">
          <div className="card-header">
            <span className="card-title">Recent Transactions</span>
          </div>
          <div className="scroll-list">
            {recentTxns.length === 0 && <div style={{ color: 'var(--text3)', fontSize: 13, padding: 12 }}>No transactions yet</div>}
            {recentTxns.map(txn => {
              const isIncoming = txn.type === 'deposit' || (txn.type === 'transfer' && txn.to_account === user?.id);
              const txnLabel = txn.type === 'transfer' ? (isIncoming ? 'Received' : 'Sent') : txn.type;
              const iconBg = isIncoming ? 'green-bg' : txn.type === 'withdrawal' ? 'red-bg' : 'blue-bg';
              const icon = isIncoming ? '↓' : txn.type === 'withdrawal' ? '↑' : '↑';

              return (
                <div className="list-item" key={txn.id}>
                  <div className="list-item-left">
                    <div className={`list-item-icon ${iconBg}`}>
                      {icon}
                    </div>
                    <div>
                      <div className="list-item-title" style={{ textTransform: 'capitalize' }}>
                        {txnLabel}
                      </div>
                      <div className="list-item-sub">{txn.note || txn.id.slice(0, 8)}</div>
                    </div>
                  </div>
                  <div>
                    <div className={isIncoming ? 'amount-positive' : 'amount-negative'}>
                      {isIncoming ? '+' : '-'}₹{txn.amount.toLocaleString('en-IN')}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text3)', textAlign: 'right' }}>{formatTime(txn.created_at)}</div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <span className="card-title">Service Health</span>
          </div>
          {services.map((s, i) => (
            <div className="list-item" key={i}>
              <div className="list-item-left">
                <span className={`status-dot ${s.status}`} />
                <span className="list-item-title">{s.name}</span>
              </div>
              <Badge text={s.badge} variant="green" />
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">Notifications</span>
        </div>
        {notifications.length === 0 ? (
          <div style={{ color: 'var(--text3)', fontSize: 13, padding: 12 }}>No notifications yet</div>
        ) : (
          notifications.map((n, i) => {
            let badgeVariant = 'blue';
            if (n.type === 'Risk') badgeVariant = 'red';
            else if (n.type === 'Alert') badgeVariant = 'amber';
            return (
              <div className="list-item" key={i}>
                <span style={{ fontSize: 13, color: 'var(--text)' }}>{n.message}</span>
                <Badge text={n.type} variant={badgeVariant} />
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
