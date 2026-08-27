'use client';

import { createContext, useState, useEffect, useContext } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';

const AuthContext = createContext();

// Synchronously initialize axios default header if token exists to prevent race conditions on initial component mounts
if (typeof window !== 'undefined') {
  const token = localStorage.getItem('smack_token');
  if (token) {
    axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  }

  // Global fetch interceptor to automatically inject Bearer tokens into all legacy fetch() calls
  const originalFetch = window.fetch;
  window.fetch = async function (...args) {
    let [resource, config] = args;
    const currentToken = localStorage.getItem('smack_token');
    
    if (currentToken && typeof resource === 'string' && resource.includes('localhost:5000')) {
      config = config || {};
      config.headers = {
        ...config.headers,
        'Authorization': `Bearer ${currentToken}`
      };
      args[1] = config;
    }
    return originalFetch.apply(this, args);
  };
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    // Check if user is logged in
    checkUserLoggedIn();
  }, []);

  const checkUserLoggedIn = async () => {
    try {
      const token = localStorage.getItem('smack_token');
      if (!token) {
        setUser(null);
        setLoading(false);
        return;
      }
      
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;

      const baseUrl = process.env.NEXT_PUBLIC_API_URL;
      const res = await fetch(baseUrl + '/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (res.ok) {
        const data = await res.json();
        setUser(data);
      } else {
        localStorage.removeItem('smack_token');
        delete axios.defaults.headers.common['Authorization'];
        setUser(null);
      }
    } catch (error) {
      console.error('Failed to check auth status', error);
      localStorage.removeItem('smack_token');
      delete axios.defaults.headers.common['Authorization'];
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  const login = async ({ email, password }) => {
    const baseUrl = process.env.NEXT_PUBLIC_API_URL;
    const res = await fetch(baseUrl + '/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password })
    });

    const data = await res.json();

    if (res.ok) {
      localStorage.setItem('smack_token', data.token);
      axios.defaults.headers.common['Authorization'] = `Bearer ${data.token}`;
      setUser(data);
      router.push('/');
    } else {
      if (res.status === 403 && data.unverified) {
        router.push(`/verify?userId=${data.userId}`);
      }
      throw new Error(data.message || 'Login failed');
    }
  };

  const register = async ({ username, email, password }) => {
    const baseUrl = process.env.NEXT_PUBLIC_API_URL;
    const res = await fetch(baseUrl + '/api/auth/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ username, email, password })
    });

    const data = await res.json();

    if (res.ok) {
      router.push(`/verify?userId=${data.userId}`);
    } else {
      throw new Error(data.message || 'Registration failed');
    }
  };

  const logout = async () => {
    localStorage.removeItem('smack_token');
    delete axios.defaults.headers.common['Authorization'];
    setUser(null);
    router.push('/login');
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
