import { useState } from 'react';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';

export default function DeepAnalysis({ onClose }) {
  const { user } = useAuth();
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const handleAnalyze = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const res = await client.post('/risk/deep-analysis', {
        query: query.trim(),
        user_id: user.id,
      });
      setResult(res.data);
    } catch (err) {
      setError(err.response?.data?.detail || 'Analysis failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const verdictColor = (v) => {
    if (v === 'Recommended') return 'var(--green)';
    if (v === 'Caution') return 'var(--amber)';
    return 'var(--red)';
  };
  const verdictBg = (v) => {
    if (v === 'Recommended') return 'var(--green-bg)';
    if (v === 'Caution') return 'var(--amber-bg)';
    return 'var(--red-bg)';
  };
  const riskColor = (s) => s > 60 ? 'var(--red)' : s > 30 ? 'var(--amber)' : 'var(--green)';

  return (
    <div className="da-overlay" id="deep-analysis-modal">
      <div className="da-modal">
        {/* Header */}
        <div className="da-modal-header">
          <div>
            <h2 className="da-modal-title">🧠 FinTwin Deep Analysis</h2>
            <p className="da-modal-sub">Powered by FinTwin Risk Engine</p>
          </div>
          <button className="da-close-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {/* Input */}
        {!result && !loading && (
          <div className="da-query-section">
            <label className="da-query-label">What would you like to analyze?</label>
            <textarea
              id="da-query-input"
              className="da-query-input"
              placeholder="e.g. I want to buy a car worth ₹8,00,000 or Should I start a ₹5,000/month SIP?"
              value={query}
              onChange={e => setQuery(e.target.value)}
              rows={3}
            />
            {error && <div className="da-error">{error}</div>}
            <button
              id="da-analyze-btn"
              className="btn btn-blue btn-full da-analyze-btn"
              onClick={handleAnalyze}
              disabled={!query.trim()}
            >
              🔍 Analyze
            </button>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="da-loading">
            <div className="da-pulse-ring" />
            <div className="da-loading-text">FinTwin Risk Engine is analyzing…</div>
            <div className="da-loading-sub">This takes a few seconds</div>
          </div>
        )}

        {/* Results */}
        {result && (
          <div className="da-results" style={{ padding: '20px 24px' }}>
            {/* Feasibility + Verdict */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 20 }}>
              <div style={{ textAlign: 'center', minWidth: 80 }}>
                <div style={{ fontSize: 42, fontWeight: 800, color: riskColor(100 - (result.feasibility_score || 0)), lineHeight: 1 }}>
                  {result.feasibility_score}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>/ 100</div>
                <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>Feasibility</div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{
                  display: 'inline-block',
                  padding: '4px 14px',
                  borderRadius: 20,
                  fontSize: 13,
                  fontWeight: 700,
                  background: verdictBg(result.verdict),
                  color: verdictColor(result.verdict),
                  marginBottom: 8
                }}>
                  {result.verdict}
                </div>
                <p style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.6 }}>{result.summary}</p>
              </div>
            </div>

            {/* Risk Before → After */}
            <div style={{
              background: 'var(--surface2)',
              borderRadius: 12,
              padding: 16,
              marginBottom: 16,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-around',
              gap: 12
            }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>Risk Before</div>
                <div style={{ fontSize: 28, fontWeight: 800, color: riskColor(result.risk_before || 0) }}>{result.risk_before ?? '—'}</div>
              </div>
              <div style={{ fontSize: 24, color: 'var(--text3)' }}>→</div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>Risk After</div>
                <div style={{ fontSize: 28, fontWeight: 800, color: riskColor(result.risk_after || 0) }}>{result.risk_after ?? '—'}</div>
              </div>
            </div>

            {/* Risk Delta */}
            {result.risk_delta && (
              <div style={{
                background: 'var(--surface2)',
                borderRadius: 10,
                padding: '10px 14px',
                marginBottom: 16,
                fontSize: 13,
                color: 'var(--text2)',
                lineHeight: 1.5
              }}>
                <strong style={{ color: 'var(--text)' }}>Risk Impact:</strong> {result.risk_delta}
              </div>
            )}

            {/* Impact */}
            {result.impact && (
              <div style={{
                background: 'var(--blue-bg)',
                borderRadius: 10,
                padding: '10px 14px',
                marginBottom: 16,
                fontSize: 13,
                color: 'var(--blue)',
                lineHeight: 1.5
              }}>
                <strong>Financial Impact:</strong> {result.impact}
              </div>
            )}

            {/* Risks */}
            {result.risks?.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>⚠️ Risk Factors</div>
                {result.risks.map((r, i) => (
                  <div key={i} style={{
                    background: 'var(--amber-bg)',
                    color: 'var(--amber)',
                    borderRadius: 8,
                    padding: '8px 12px',
                    marginBottom: 6,
                    fontSize: 13,
                    lineHeight: 1.4
                  }}>⚠ {r}</div>
                ))}
              </div>
            )}

            {/* Tips */}
            {result.tips?.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>💡 Recommendations</div>
                {result.tips.map((t, i) => (
                  <div key={i} style={{
                    background: 'var(--green-bg)',
                    color: 'var(--green)',
                    borderRadius: 8,
                    padding: '8px 12px',
                    marginBottom: 6,
                    fontSize: 13,
                    lineHeight: 1.4
                  }}>✓ {t}</div>
                ))}
              </div>
            )}

            {/* Verdict Footer */}
            <div style={{
              background: verdictBg(result.verdict),
              borderRadius: 12,
              padding: 16,
              textAlign: 'center',
              border: `1px solid ${verdictColor(result.verdict)}20`
            }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: verdictColor(result.verdict), marginBottom: 4 }}>
                {result.verdict}
              </div>
              <p style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.5 }}>{result.verdict_reason}</p>
            </div>

            <button
              className="btn btn-outline"
              style={{ width: '100%', marginTop: 16 }}
              onClick={() => { setResult(null); setQuery(''); setError(''); }}
            >
              ↩ Analyze Something Else
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
