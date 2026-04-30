import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import client from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isProfileComplete, setIsProfileComplete] = useState(false);
  const [persona, setPersona] = useState(null);

  const fetchPersona = useCallback(async () => {
    try {
      const res = await client.get('/auth/persona-score');
      setPersona(res.data);
    } catch {
      // Persona not available yet — profile might not be complete
    }
  }, []);

  // On mount, validate saved token
  useEffect(() => {
    const validateToken = async () => {
      const saved = localStorage.getItem('ft_token');
      if (!saved) {
        setLoading(false);
        return;
      }

      try {
        const res = await client.get('/auth/me');
        setToken(saved);
        setUser(res.data);
        setIsProfileComplete(res.data.is_profile_complete || false);

        if (res.data.is_profile_complete) {
          // Fetch persona score in background
          try {
            const personaRes = await client.get('/auth/persona-score');
            setPersona(personaRes.data);
          } catch {
            // Non-critical
          }
        }
      } catch {
        localStorage.removeItem('ft_token');
      } finally {
        setLoading(false);
      }
    };

    validateToken();
  }, []);

  const loginWithGoogle = async (credential) => {
    const res = await client.post('/auth/google', { credential });
    const { ft_token, user: userData } = res.data;
    localStorage.setItem('ft_token', ft_token);
    setToken(ft_token);
    setUser(userData);
    setIsProfileComplete(userData.is_profile_complete || false);

    if (userData.is_profile_complete) {
      await fetchPersona();
    }

    return userData;
  };

  const refreshUser = async () => {
    try {
      const res = await client.get('/auth/me');
      setUser(res.data);
      setIsProfileComplete(res.data.is_profile_complete || false);
      if (res.data.is_profile_complete) {
        await fetchPersona();
      }
    } catch {
      // Silent fail
    }
  };

  const logout = () => {
    localStorage.clear();
    setUser(null);
    setToken(null);
    setPersona(null);
    setIsProfileComplete(false);
  };

  const isAuthenticated = !!user && !!token;

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        isAuthenticated,
        isProfileComplete,
        persona,
        loginWithGoogle,
        refreshUser,
        fetchPersona,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
