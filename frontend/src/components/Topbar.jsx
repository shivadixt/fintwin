import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

export default function Topbar({ onToggleSidebar }) {
  const { user } = useAuth();
  const navigate = useNavigate();

  const initials = user?.full_name
    ? user.full_name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
    : user?.account_name
    ? user.account_name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
    : '??';

  const displayName = user?.full_name || user?.account_name || 'User';

  const toggleTheme = () => {
    const current = document.documentElement.getAttribute('data-theme');
    if (current === 'dark') {
      document.documentElement.removeAttribute('data-theme');
      localStorage.setItem('ft_theme', 'light');
    } else {
      document.documentElement.setAttribute('data-theme', 'dark');
      localStorage.setItem('ft_theme', 'dark');
    }
  };

  // Restore theme on mount
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem('ft_theme');
    if (saved === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
    }
  }

  const isDark = typeof document !== 'undefined' &&
    document.documentElement.getAttribute('data-theme') === 'dark';

  return (
    <div className="topbar">
      <div className="topbar-left">
        <button className="hamburger-btn" onClick={onToggleSidebar} aria-label="Toggle sidebar">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <rect y="2" width="18" height="2" rx="1" fill="currentColor"/>
            <rect y="8" width="18" height="2" rx="1" fill="currentColor"/>
            <rect y="14" width="18" height="2" rx="1" fill="currentColor"/>
          </svg>
        </button>
      </div>

      <div className="topbar-center" onClick={() => navigate('/dashboard')} style={{ cursor: 'pointer' }}>
        <div className="topbar-logo" />
        <span className="topbar-title">FinTwin</span>
      </div>

      <div className="topbar-right">
        <button className="theme-btn" onClick={toggleTheme} aria-label="Toggle theme">
          {isDark ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="5"/>
              <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M16.36 16.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M16.36 7.64l1.42-1.42"/>
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
            </svg>
          )}
        </button>
        <div className="user-pill">
          {user?.picture ? (
            <img src={user.picture} alt="" style={{ width: 28, height: 28, borderRadius: '50%' }} referrerPolicy="no-referrer" />
          ) : (
            <div className="avatar avatar-sm">{initials}</div>
          )}
          <span className="user-name">{displayName}</span>
        </div>
      </div>
    </div>
  );
}
