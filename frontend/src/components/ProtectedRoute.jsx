import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function ProtectedRoute({ children, requireProfileComplete = false }) {
  const { isAuthenticated, isProfileComplete, loading } = useAuth();

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        color: 'var(--text3)',
        fontSize: 15,
      }}>
        <div className="login-spinner" style={{ marginRight: 12 }} />
        Loading…
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (requireProfileComplete && !isProfileComplete) {
    return <Navigate to="/onboarding" replace />;
  }

  return children;
}
