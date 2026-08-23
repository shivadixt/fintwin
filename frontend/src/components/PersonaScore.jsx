import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

export default function PersonaScore() {
  const { persona } = useAuth();
  const [animatedScore, setAnimatedScore] = useState(0);
  const [dismissedTips, setDismissedTips] = useState([]);

  useEffect(() => {
    if (!persona) return;
    let start = 0;
    const end = persona.score;
    const duration = 1200;
    const stepTime = duration / end;
    const timer = setInterval(() => {
      start += 1;
      setAnimatedScore(start);
      if (start >= end) clearInterval(timer);
    }, stepTime);
    return () => clearInterval(timer);
  }, [persona]);

  if (!persona) return null;

  const circumference = 2 * Math.PI * 54;
  const progress = (animatedScore / 100) * circumference;
  const offset = circumference - progress;

  const getScoreColor = (score) => {
    if (score >= 75) return 'var(--green)';
    if (score >= 50) return 'var(--blue)';
    if (score >= 30) return 'var(--amber)';
    return 'var(--red)';
  };

  const dismissTip = (index) => {
    setDismissedTips(prev => [...prev, index]);
  };

  const visibleTips = persona.tips.filter((_, i) => !dismissedTips.includes(i));

  return (
    <div className="persona-section">
      <div className="persona-score-card card">
        <div className="persona-score-ring-wrapper">
          <svg className="persona-ring" width="130" height="130" viewBox="0 0 130 130">
            <circle
              cx="65" cy="65" r="54"
              fill="none"
              stroke="var(--surface2)"
              strokeWidth="8"
            />
            <circle
              cx="65" cy="65" r="54"
              fill="none"
              stroke={getScoreColor(animatedScore)}
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              transform="rotate(-90 65 65)"
              style={{ transition: 'stroke-dashoffset 0.1s linear' }}
            />
          </svg>
          <div className="persona-ring-center">
            <span className="persona-ring-score">{animatedScore}</span>
            <span className="persona-ring-label">/ 100</span>
          </div>
        </div>
        <div className="persona-info">
          <span className="persona-emoji">{persona.emoji}</span>
          <h3 className="persona-label">{persona.label}</h3>
          <p className="persona-sublabel">Financial Persona Score</p>
        </div>
      </div>

      {visibleTips.length > 0 && (
        <div className="persona-tips">
          <h3 className="card-title" style={{ marginBottom: 12 }}>💡 Personalized Tips</h3>
          <div className="persona-tips-grid">
            {persona.tips.map((tip, i) => (
              !dismissedTips.includes(i) && (
                <div className="persona-tip-card card" key={i}>
                  <button
                    className="persona-tip-dismiss"
                    onClick={() => dismissTip(i)}
                    title="Dismiss"
                  >×</button>
                  <span className="persona-tip-icon">{tip.icon}</span>
                  <p className="persona-tip-text">{tip.text}</p>
                </div>
              )
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
