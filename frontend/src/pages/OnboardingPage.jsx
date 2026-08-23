import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import client from '../api/client';
import { showToast } from '../components/Toast';

const COUNTRY_CODES = [
  { code: '+91', label: 'IN +91', country: 'India' },
  { code: '+1', label: 'US +1', country: 'USA' },
  { code: '+44', label: 'UK +44', country: 'UK' },
  { code: '+49', label: 'DE +49', country: 'Germany' },
  { code: '+33', label: 'FR +33', country: 'France' },
  { code: '+81', label: 'JP +81', country: 'Japan' },
  { code: '+86', label: 'CN +86', country: 'China' },
  { code: '+61', label: 'AU +61', country: 'Australia' },
  { code: '+971', label: 'AE +971', country: 'UAE' },
  { code: '+65', label: 'SG +65', country: 'Singapore' },
];

const CURRENCIES = [
  { value: 'INR', label: '🇮🇳 INR — Indian Rupee', symbol: '₹' },
  { value: 'USD', label: '🇺🇸 USD — US Dollar', symbol: '$' },
  { value: 'EUR', label: '🇪🇺 EUR — Euro', symbol: '€' },
  { value: 'GBP', label: '🇬🇧 GBP — British Pound', symbol: '£' },
];

export default function OnboardingPage() {
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);

  const [accountName, setAccountName] = useState(user?.full_name || '');
  const [countryCode, setCountryCode] = useState('+91');
  const [phoneNumber, setPhoneNumber] = useState('');

  const [currency, setCurrency] = useState('INR');
  const [initialBalance, setInitialBalance] = useState('');

  const [errors, setErrors] = useState({});

  const selectedCurrency = CURRENCIES.find(c => c.value === currency);

  const validateStep1 = () => {
    const errs = {};
    if (!accountName.trim()) errs.accountName = 'Account name is required';
    if (!phoneNumber.trim()) errs.phoneNumber = 'Phone number is required';
    else if (!/^\d{7,15}$/.test(phoneNumber.replace(/\s/g, '')))
      errs.phoneNumber = 'Enter a valid phone number';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const validateStep2 = () => {
    const errs = {};
    if (!initialBalance || parseFloat(initialBalance) <= 0) errs.initialBalance = 'Enter a valid amount';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleNext = () => {
    if (step === 1 && validateStep1()) setStep(2);
  };

  const handleBack = () => {
    setErrors({});
    setStep(1);
  };

  const handleSubmit = async () => {
    if (!validateStep2()) return;
    setSaving(true);
    try {
      // 1. Save profile with sensible defaults for goal/risk
      await client.put('/auth/profile', {
        account_name: accountName.trim(),
        phone_number: `${countryCode}${phoneNumber.trim()}`,
        currency_preference: currency,
        monthly_income: parseFloat(initialBalance),
        financial_goal: 'savings',
        risk_appetite: 'medium',
      });

      // 2. Add initial deposit
      try {
        await client.post('/transactions/', {
          account_id: user?.id || '',
          type: 'deposit',
          amount: parseFloat(initialBalance),
          note: 'Initial account deposit',
        });
      } catch {
        // Non-critical — profile is saved even if deposit fails
      }

      showToast('Account set up! Welcome to FinTwin 🎉');
      await refreshUser();
      navigate('/dashboard');
    } catch (err) {
      showToast(err.response?.data?.detail || 'Setup failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="onboarding-page">
      <div className="onboarding-container">

        {/* Header */}
        <div className="onboarding-header">
          <div className="login-logo" style={{ justifyContent: 'center' }}>
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
              <rect width="28" height="28" rx="7" fill="var(--text)" />
              <path d="M8 10h12M8 14h8M8 18h10" stroke="var(--bg)" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <span className="login-logo-text" style={{ marginLeft: 10 }}>FinTwin</span>
          </div>
          <h1 className="onboarding-title">Set Up Your Account</h1>
          <p className="onboarding-subtitle">Quick setup — just 2 steps to get started</p>
        </div>

        {/* Progress Bar */}
        <div className="onboarding-progress">
          {[1, 2].map(s => (
            <div key={s} className="onboarding-progress-step">
              <div className={`onboarding-step-dot ${s <= step ? 'active' : ''} ${s < step ? 'completed' : ''}`}>
                {s < step ? '✓' : s}
              </div>
              <span className={`onboarding-step-label ${s <= step ? 'active' : ''}`}>
                {s === 1 ? 'Personal' : 'Fund Account'}
              </span>
              {s < 2 && <div className={`onboarding-step-line ${s < step ? 'active' : ''}`} />}
            </div>
          ))}
        </div>

        {/* Step 1 — Personal Info */}
        {step === 1 && (
          <div className="onboarding-card">
            <h2 className="onboarding-card-title">👤 Personal Information</h2>

            {user && (
              <div className="onboarding-avatar-row">
                {user.picture ? (
                  <img src={user.picture} alt="Profile" className="onboarding-avatar" referrerPolicy="no-referrer" />
                ) : (
                  <div className="onboarding-avatar-placeholder">
                    {user.full_name?.[0] || 'U'}
                  </div>
                )}
                <div>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>{user.full_name}</div>
                  <div style={{ color: 'var(--text3)', fontSize: 13 }}>{user.email}</div>
                </div>
              </div>
            )}

            <div className="form-group">
              <label className="form-label">Account Name</label>
              <input
                className={`form-input ${errors.accountName ? 'input-error' : ''}`}
                value={accountName}
                onChange={e => setAccountName(e.target.value)}
                placeholder="Your display name"
              />
              {errors.accountName && <span className="field-error">{errors.accountName}</span>}
            </div>

            <div className="form-group">
              <label className="form-label">Phone Number</label>
              <div className="phone-input-row">
                <select
                  className="form-select phone-code-select"
                  value={countryCode}
                  onChange={e => setCountryCode(e.target.value)}
                >
                  {COUNTRY_CODES.map(c => (
                    <option key={c.code} value={c.code}>{c.label}</option>
                  ))}
                </select>
                <input
                  className={`form-input phone-number-input ${errors.phoneNumber ? 'input-error' : ''}`}
                  value={phoneNumber}
                  onChange={e => setPhoneNumber(e.target.value.replace(/\D/g, ''))}
                  placeholder="9876543210"
                  type="tel"
                />
              </div>
              {errors.phoneNumber && <span className="field-error">{errors.phoneNumber}</span>}
            </div>

            <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn btn-primary" onClick={handleNext}>Next →</button>
            </div>
          </div>
        )}

        {/* Step 2 — Add Money */}
        {step === 2 && (
          <div className="onboarding-card">
            <h2 className="onboarding-card-title">💰 Fund Your Account</h2>
            <p style={{ color: 'var(--text3)', fontSize: 13, marginBottom: 20 }}>
              Add an initial amount to get started with FinTwin. You can always add more later.
            </p>

            <div className="form-group">
              <label className="form-label">Currency</label>
              <select
                className="form-select"
                value={currency}
                onChange={e => setCurrency(e.target.value)}
              >
                {CURRENCIES.map(c => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Amount to Add ({selectedCurrency?.symbol || '₹'})</label>
              <input
                className={`form-input ${errors.initialBalance ? 'input-error' : ''}`}
                type="number"
                value={initialBalance}
                onChange={e => setInitialBalance(e.target.value)}
                placeholder="100000"
                min="1"
                style={{ fontSize: 18, fontWeight: 600, padding: '14px 16px' }}
              />
              {errors.initialBalance && <span className="field-error">{errors.initialBalance}</span>}
              {initialBalance && parseFloat(initialBalance) > 0 && (
                <div style={{ marginTop: 8, fontSize: 13, color: 'var(--text3)' }}>
                  Your starting balance will be <strong style={{ color: 'var(--green)' }}>{selectedCurrency?.symbol}{parseFloat(initialBalance).toLocaleString('en-IN')}</strong>
                </div>
              )}
            </div>

            <div style={{ marginTop: 24, display: 'flex', justifyContent: 'space-between' }}>
              <button className="btn btn-outline" onClick={handleBack} disabled={saving}>
                ← Back
              </button>
              <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
                {saving ? 'Setting up…' : '🚀 Start Using FinTwin'}
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
