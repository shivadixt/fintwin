import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
  const { loginWithGoogle } = useAuth();

  return (
    <div className="login-page">
      {/* Animated background */}
      <div className="login-bg">
        <div className="login-bg-orb orb1" />
        <div className="login-bg-orb orb2" />
        <div className="login-bg-orb orb3" />
      </div>

      {/* Left Panel — Branding */}
      <div className="login-left">
        <div className="login-brand">
          <div className="login-brand-icon">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <rect width="32" height="32" rx="10" fill="url(#brandGrad)" />
              <path d="M8 22L14 12L18 18L22 10" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="24" cy="10" r="2" fill="white" />
              <defs>
                <linearGradient id="brandGrad" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#6366f1" />
                  <stop offset="1" stopColor="#4f46e5" />
                </linearGradient>
              </defs>
            </svg>
          </div>
          <span className="login-brand-name">FinTwin</span>
        </div>

        <div className="login-left-content">
          <h1 className="login-left-headline">
            Your Financial<br />
            <span className="login-gradient-text">Digital Twin</span>
          </h1>
          <p className="login-left-desc">
            Understand your money deeply. Track, analyze, and plan your financial future with intelligent insights built around your data.
          </p>

          <div className="login-feature-list">
            <div className="login-feature-row">
              <div className="login-feature-dot indigo" />
              <span>Instant bank statement analysis</span>
            </div>
            <div className="login-feature-row">
              <div className="login-feature-dot violet" />
              <span>Risk scoring & anomaly detection</span>
            </div>
            <div className="login-feature-row">
              <div className="login-feature-dot blue" />
              <span>Deep financial projections</span>
            </div>
            <div className="login-feature-row">
              <div className="login-feature-dot teal" />
              <span>Portfolio & asset tracking</span>
            </div>
          </div>
        </div>

        <div className="login-left-footer">
          <span>© 2024 FinTwin</span>
        </div>
      </div>

      {/* Right Panel — Sign In */}
      <div className="login-right">
        <div className="login-card">
          <div className="login-card-header">
            <h2 className="login-card-title">Welcome back</h2>
            <p className="login-card-sub">Sign in to your FinTwin account</p>
          </div>

          <button
            id="google-signin-btn"
            className="btn-google-new"
            onClick={loginWithGoogle}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 48 48">
              <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8c-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4C12.955 4 4 12.955 4 24s8.955 20 20 20s20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z" />
              <path fill="#FF3D00" d="m6.306 14.691 6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4C16.318 4 9.656 8.337 6.306 14.691z" />
              <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z" />
              <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z" />
            </svg>
            <span>Continue with Google</span>
          </button>

          <div className="login-divider">
            <div className="login-divider-line" />
            <span className="login-divider-text">secure sign-in</span>
            <div className="login-divider-line" />
          </div>

          <div className="login-trust-row">
            <div className="login-trust-item">
              <span className="login-trust-icon">🔒</span>
              <span>End-to-end encrypted</span>
            </div>
            <div className="login-trust-item">
              <span className="login-trust-icon">🛡️</span>
              <span>No password stored</span>
            </div>
            <div className="login-trust-item">
              <span className="login-trust-icon">⚡</span>
              <span>Instant access</span>
            </div>
          </div>

          <p className="login-terms">
            By signing in, you agree to our{' '}
            <span className="login-link">Terms of Service</span> and{' '}
            <span className="login-link">Privacy Policy</span>.
          </p>
        </div>
      </div>
    </div>
  );
}
