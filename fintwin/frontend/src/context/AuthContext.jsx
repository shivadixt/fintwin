import { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check for OAuth callback params in URL first
    const params = new URLSearchParams(window.location.search);
    const callbackToken = params.get('token');
    const callbackName = params.get('name');
    const callbackId = params.get('id');
    const callbackEmail = params.get('email');

    if (callbackToken && callbackName && callbackId) {
      sessionStorage.setItem('ft_token', callbackToken);
      sessionStorage.setItem('ft_user', JSON.stringify({ id: callbackId, name: callbackName, email: callbackEmail }));
      setToken(callbackToken);
      setUser({ id: callbackId, name: callbackName, email: callbackEmail });
      // Clean URL
      window.history.replaceState({}, document.title, '/');
      setLoading(false);
      return;
    }

    // Restore from session
    const savedToken = sessionStorage.getItem('ft_token');
    const savedUser = sessionStorage.getItem('ft_user');
    if (savedToken && savedUser) {
      try {
        setToken(savedToken);
        setUser(JSON.parse(savedUser));
      } catch {
        sessionStorage.clear();
      }
    }
    setLoading(false);
  }, []);

  const loginWithGoogle = () => {
    // Redirect to backend Google OAuth endpoint (proxied via Nginx)
    window.location.href = '/api/auth/google';
  };

  const logout = async () => {
    const savedToken = sessionStorage.getItem('ft_token');
    if (savedToken) {
      try {
        await fetch(`/api/auth/logout?token=${savedToken}`, { method: 'POST' });
      } catch { /* ignore */ }
    }
    sessionStorage.clear();
    setUser(null);
    setToken(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, loginWithGoogle, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
