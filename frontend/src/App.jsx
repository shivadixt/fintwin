import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Topbar from './components/Topbar';
import Sidebar from './components/Sidebar';
import Toast from './components/Toast';
import AiAssistant from './components/AiAssistant';
import LoginPage from './pages/LoginPage';
import OnboardingPage from './pages/OnboardingPage';
import Dashboard from './pages/Dashboard';
import Transactions from './pages/Transactions';
import DigitalTwin from './pages/DigitalTwin';
import RiskAnalysis from './pages/RiskAnalysis';
import Portfolio from './pages/Portfolio';
import Notifications from './pages/Notifications';
import { useState } from 'react';

function AppShell({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="app-layout">
      <Topbar onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
      <div className="app-content">
        {children}
      </div>
      <Toast />
      <AiAssistant />
    </div>
  );
}

export default function App() {
  const { loading, isAuthenticated, isProfileComplete } = useAuth();

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        color: 'var(--text3)',
      }}>
        <div className="login-spinner" style={{ marginRight: 12 }} />
        Loading…
      </div>
    );
  }

  return (
    <Routes>
      {/* Public route */}
      <Route
        path="/login"
        element={
          isAuthenticated
            ? <Navigate to={isProfileComplete ? '/dashboard' : '/onboarding'} replace />
            : <>
                <LoginPage />
                <Toast />
              </>
        }
      />

      {/* Onboarding — must be logged in, redirect if profile already done */}
      <Route
        path="/onboarding"
        element={
          isAuthenticated && isProfileComplete
            ? <Navigate to="/dashboard" replace />
            : <ProtectedRoute>
                <OnboardingPage />
                <Toast />
              </ProtectedRoute>
        }
      />

      {/* Protected dashboard routes */}
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute requireProfileComplete>
            <AppShell><Dashboard /></AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/transactions"
        element={
          <ProtectedRoute requireProfileComplete>
            <AppShell><Transactions /></AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/twin"
        element={
          <ProtectedRoute requireProfileComplete>
            <AppShell><DigitalTwin /></AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/risk"
        element={
          <ProtectedRoute requireProfileComplete>
            <AppShell><RiskAnalysis /></AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/portfolio"
        element={
          <ProtectedRoute requireProfileComplete>
            <AppShell><Portfolio /></AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/notifications"
        element={
          <ProtectedRoute requireProfileComplete>
            <AppShell><Notifications /></AppShell>
          </ProtectedRoute>
        }
      />

      {/* Catch-all */}
      <Route
        path="*"
        element={<Navigate to={isAuthenticated ? (isProfileComplete ? '/dashboard' : '/onboarding') : '/login'} replace />}
      />
    </Routes>
  );
}
