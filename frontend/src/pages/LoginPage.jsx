import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GoogleLogin } from '@react-oauth/google';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
  const { loginWithGoogle } = useAuth();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleGoogleSuccess = async (credentialResponse) => {
    setError('');
    setLoading(true);
    try {
      const userData = await loginWithGoogle(credentialResponse.credential);
      if (userData.is_profile_complete) {
        navigate('/dashboard');
      } else {
        navigate('/onboarding');
      }
    } catch (err) {
      const msg = err.response?.data?.detail || 'Google sign-in failed. Please try again.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleError = () => {
    setError('Google sign-in was cancelled or failed. Please try again.');
  };

  return (
    <div className="login-page">
      {/* Animated background orbs */}
      <div className="login-bg-orb login-bg-orb-1" />
      <div className="login-bg-orb login-bg-orb-2" />
      <div className="login-bg-orb login-bg-orb-3" />

      <div className="login-card">
        <div className="login-logo">
          <div className="login-logo-icon">
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
              <rect width="28" height="28" rx="7" fill="var(--text)" />
              <path d="M8 10h12M8 14h8M8 18h10" stroke="var(--bg)" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>
          <span className="login-logo-text">FinTwin</span>
        </div>

        <h1 className="login-title">Welcome to FinTwin</h1>
        <p className="login-subtitle">
          Your intelligent financial digital twin — simulate, analyze, and optimize your financial future.
        </p>

        <div className="login-features">
          <div className="login-feature">
            <span className="login-feature-icon">🔮</span>
            <span>What-if simulations</span>
          </div>
          <div className="login-feature">
            <span className="login-feature-icon">📊</span>
            <span>Risk analysis</span>
          </div>
          <div className="login-feature">
            <span className="login-feature-icon">🎯</span>
            <span>Persona scoring</span>
          </div>
        </div>

        {error && <div className="login-error">{error}</div>}

        <div className="login-google-wrapper">
          {loading ? (
            <div className="login-loading">
              <div className="login-spinner" />
              <span>Signing you in…</span>
            </div>
          ) : (
            <GoogleLogin
              onSuccess={handleGoogleSuccess}
              onError={handleGoogleError}
              size="large"
              width="340"
              theme="outline"
              text="signin_with"
              shape="rectangular"
            />
          )}
        </div>

        <p className="login-footer-text">
          By signing in, you agree to FinTwin's Terms of Service and Privacy Policy.
        </p>
      </div>
    </div>
  );
}
