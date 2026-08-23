import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import client from '../api/client';
import { showToast } from '../components/Toast';

export default function Transactions() {
  const { user } = useAuth();
  const [transactions, setTransactions] = useState([]);
  const [type, setType] = useState('deposit');
  const [amount, setAmount] = useState('');
  const [toAccount, setToAccount] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const PAGE_SIZE = 10;

  const fetchData = async () => {
    try {
      const txnRes = await client.get(`/transactions/?limit=${PAGE_SIZE}&offset=0`);
      const txns = txnRes.data;
      setTransactions(txns);
      setHasMore(txns.length >= PAGE_SIZE);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const res = await client.get(`/transactions/?limit=${PAGE_SIZE}&offset=${transactions.length}`);
      const newTxns = res.data;
      setTransactions(prev => [...prev, ...newTxns]);
      setHasMore(newTxns.length >= PAGE_SIZE);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingMore(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const payload = {
        account_id: user?.id || '',
        type,
        amount: parseFloat(amount),
        note: note || null,
      };
      if (type === 'transfer') payload.to_account = toAccount;
      await client.post('/transactions/', payload);
      showToast('Transaction recorded');
      setAmount('');
      setNote('');
      setToAccount('');
      fetchData();
    } catch (err) {
      showToast(err.response?.data?.detail || 'Transaction failed');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (v) => `₹${v.toLocaleString('en-IN')}`;
  const formatTime = (ts) => {
    const d = new Date(ts);
    return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Transactions</h1>
      </div>

      <div className="two-col">
        <div className="card">
          <div className="card-header">
            <span className="card-title">New Transaction</span>
          </div>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">Type</label>
              <select className="form-select" value={type} onChange={e => setType(e.target.value)}>
                <option value="deposit">Deposit</option>
                <option value="withdrawal">Withdrawal</option>
                <option value="transfer">Transfer</option>
              </select>
            </div>
            {type === 'transfer' && (
              <div className="form-group">
                <label className="form-label">Destination Account ID</label>
                <input className="form-input" value={toAccount} onChange={e => setToAccount(e.target.value)} placeholder="Enter destination account ID" required />
              </div>
            )}
            <div className="form-group">
              <label className="form-label">Amount (₹)</label>
              <input className="form-input" type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0" min="1" required />
            </div>
            <div className="form-group">
              <label className="form-label">Note (optional)</label>
              <input className="form-input" value={note} onChange={e => setNote(e.target.value)} placeholder="Add a note" />
            </div>
            <button className="btn btn-primary btn-full" type="submit" disabled={loading}>
              {loading ? 'Processing…' : 'Submit Transaction'}
            </button>
          </form>
        </div>

        <div className="card">
          <div className="card-header">
            <span className="card-title">Transaction History</span>
          </div>
          <div className="scroll-list">
            {transactions.length === 0 && (
              <div style={{ color: 'var(--text3)', fontSize: 13, padding: 12 }}>No transactions yet</div>
            )}
            {transactions.map(txn => {
              const isIncoming = txn.type === 'deposit' || (txn.type === 'transfer' && txn.to_account === user?.id);
              const txnLabel = txn.type === 'transfer' ? (isIncoming ? 'Received' : 'Sent') : txn.type;
              const iconBg = isIncoming ? 'green-bg' : txn.type === 'withdrawal' ? 'red-bg' : 'blue-bg';
              const icon = isIncoming ? '↓' : txn.type === 'withdrawal' ? '↑' : '↑';
              const subText = txn.type === 'transfer'
                ? (isIncoming ? `From ${txn.account_id.slice(0, 8)}…` : `To ${txn.to_account?.slice(0, 8)}…`)
                : (txn.note || txn.id.slice(0, 8));
              
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
                    <div className="list-item-sub">{subText}</div>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className={isIncoming ? 'amount-positive' : 'amount-negative'}>
                    {isIncoming ? '+' : '-'}{formatCurrency(txn.amount)}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text3)' }}>{formatTime(txn.created_at)}</div>
                </div>
              </div>
            )})}
          </div>
          {hasMore && transactions.length > 0 && (
            <div style={{ padding: '12px 0', textAlign: 'center' }}>
              <button className="btn btn-outline" onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? 'Loading…' : 'Load More'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
