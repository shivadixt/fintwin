import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import client from '../api/client';

const navItems = [
  { id: 'dashboard', label: 'Dashboard', icon: '⊞', path: '/dashboard' },
  { id: 'transactions', label: 'Transactions', icon: '↕', path: '/transactions' },
  { id: 'twin', label: 'Digital Twin', icon: '◷', path: '/twin' },
  { id: 'risk', label: 'Risk Analysis', icon: '⚠', path: '/risk' },
  { id: 'portfolio', label: 'Portfolio', icon: '📈', path: '/portfolio' },
  { id: 'notifications', label: 'Notifications', icon: '🔔', path: '/notifications', hasBadge: true },
];

export default function Sidebar({ isOpen, onClose }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [unreadCount, setUnreadCount] = useState(0);

  const currentPath = location.pathname;

  const initials = user?.full_name
    ? user.full_name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
    : user?.account_name
    ? user.account_name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
    : '??';

  const displayName = user?.full_name || user?.account_name || 'User';
  const displayEmail = user?.email || '';

  const fetchUnreadCount = async () => {
    if (!user?.id) return;
    try {
      const res = await client.get(`/notifications/count/${user.id}`);
      setUnreadCount(res.data.unread || 0);
    } catch {
      // Silently fail — notification service may not be up yet
    }
  };

  useEffect(() => {
    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 30000); // Every 30 seconds
    return () => clearInterval(interval);
  }, [user]);

  const handleNav = (path) => {
    navigate(path);
    onClose();
    if (path !== '/notifications') {
      fetchUnreadCount();
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <>
      <div className={`sidebar-overlay ${isOpen ? 'open' : ''}`} onClick={onClose} />
      <aside className={`sidebar ${isOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <div className="topbar-logo" />
          <span className="sidebar-brand">FinTwin</span>
        </div>

        <nav className="sidebar-nav">
          {navItems.map(item => (
            <button
              key={item.id}
              className={`nav-item ${currentPath === item.path ? 'active' : ''}`}
              onClick={() => handleNav(item.path)}
            >
              <span className="nav-icon">{item.icon}</span>
              <span style={{ flex: 1, textAlign: 'left' }}>{item.label}</span>
              {item.hasBadge && unreadCount > 0 && (
                <span style={{
                  background: 'var(--red)',
                  color: '#fff',
                  fontSize: 10,
                  fontWeight: 700,
                  minWidth: 18,
                  height: 18,
                  borderRadius: 9,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '0 5px',
                  lineHeight: 1,
                }}>
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          {user?.picture ? (
            <img src={user.picture} alt="" className="sidebar-avatar-img" referrerPolicy="no-referrer" />
          ) : (
            <div className="avatar">{initials}</div>
          )}
          <div className="sidebar-user-info">
            <div className="sidebar-user-name">{displayName}</div>
            <div className="sidebar-user-email">{displayEmail}</div>
          </div>
          <button className="logout-btn" onClick={handleLogout} aria-label="Logout" title="Logout">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
          </button>
        </div>
      </aside>
    </>
  );
}
