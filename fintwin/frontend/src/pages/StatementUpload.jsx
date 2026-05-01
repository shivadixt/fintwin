import { useState, useRef } from 'react';
import client from '../api/client';
import { showToast } from '../components/Toast';

export default function StatementUpload() {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const fileRef = useRef();

  const handleFile = async (file) => {
    if (!file) return;
    const name = file.name.toLowerCase();
    if (!name.endsWith('.pdf') && !name.endsWith('.csv')) {
      showToast('Only PDF and CSV files are accepted', 'error');
      return;
    }
    setUploading(true);
    setResult(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await client.post('/transactions/statements/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setResult(res.data);
      showToast(`✅ ${res.data.transaction_count} transactions extracted!`);
      loadHistory();
    } catch (err) {
      const msg = err.response?.data?.detail || 'Upload failed. Please check the file format.';
      showToast(msg, 'error');
    } finally {
      setUploading(false);
    }
  };

  const loadHistory = async () => {
    try {
      const res = await client.get('/transactions/statements/history');
      setHistory(res.data);
      setHistoryLoaded(true);
    } catch { /* ignore */ }
  };

  const deleteStatement = async (id) => {
    try {
      await client.delete(`/transactions/statements/${id}`);
      setHistory(h => h.filter(r => r.id !== id));
      showToast('Statement deleted');
    } catch {
      showToast('Failed to delete', 'error');
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Upload Bank Statement</h1>
        <button className="btn btn-outline" onClick={loadHistory}>View History</button>
      </div>

      {/* Drop Zone */}
      <div
        className={`upload-dropzone${dragging ? ' dragging' : ''}`}
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0]); }}
        onClick={() => fileRef.current?.click()}
      >
        <input ref={fileRef} type="file" accept=".pdf,.csv" style={{ display: 'none' }} onChange={e => handleFile(e.target.files[0])} />
        {uploading ? (
          <div className="upload-loading">
            <div className="upload-spinner" />
            <span>Parsing your statement…</span>
          </div>
        ) : (
          <div className="upload-prompt">
            <div className="upload-icon">📄</div>
            <p className="upload-title">Drag & Drop your bank statement here</p>
            <p className="upload-sub">Supports <strong>PDF</strong> and <strong>CSV</strong> formats · Click to browse</p>
          </div>
        )}
      </div>

      {/* Result Card */}
      {result && (
        <div className="upload-result-card">
          <div className="upload-result-header">
            <span className="upload-result-icon">✅</span>
            <div>
              <div className="upload-result-title">{result.transaction_count} transactions extracted from <em>{result.filename}</em></div>
              <div className="upload-result-sub">Preview of first {result.preview?.length} transactions:</div>
            </div>
          </div>
          <table className="upload-preview-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Type</th>
                <th>Amount</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              {result.preview?.map((row, i) => (
                <tr key={i}>
                  <td>{i + 1}</td>
                  <td>
                    <span className={`badge ${row.type === 'deposit' ? 'green' : 'red'}`}>
                      {row.type}
                    </span>
                  </td>
                  <td className={row.type === 'deposit' ? 'amount-positive' : 'amount-negative'}>
                    ₹{row.amount?.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--text2)', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* History */}
      {historyLoaded && (
        <div className="card" style={{ marginTop: 24 }}>
          <div className="card-header">
            <span className="card-title">Upload History</span>
          </div>
          {history.length === 0 ? (
            <p style={{ color: 'var(--text3)', fontSize: 13, padding: 8 }}>No previous uploads found.</p>
          ) : (
            history.map(rec => (
              <div className="list-item" key={rec.id}>
                <div className="list-item-left">
                  <div className="list-item-icon blue-bg">📄</div>
                  <div>
                    <div className="list-item-title">{rec.filename}</div>
                    <div className="list-item-sub">{rec.transaction_count} transactions · {new Date(rec.uploaded_at).toLocaleDateString('en-IN')}</div>
                  </div>
                </div>
                <button className="btn btn-outline" style={{ fontSize: 12, padding: '6px 12px', color: 'var(--red)', borderColor: 'var(--red)' }} onClick={() => deleteStatement(rec.id)}>
                  Delete
                </button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
