'use client';

import {
  createContext,
  useState,
  useEffect,
  useContext
} from 'react';

import { useRouter } from 'next/navigation';
import axios from 'axios';

const AuthContext = createContext();

// ------------------------------------------------------------
// INITIALIZE AUTHORIZATION HEADER
// ------------------------------------------------------------

if (typeof window !== 'undefined') {
  const token =
    localStorage.getItem('smack_token');

  if (token) {
    axios.defaults.headers.common[
      'Authorization'
    ] = `Bearer ${token}`;
  }

  // Global fetch interceptor for existing application
  // requests that use fetch().
  const originalFetch = window.fetch;

  window.fetch = async function (...args) {
    let [resource, config] = args;

    const currentToken =
      localStorage.getItem('smack_token');

    const apiUrl =
      process.env.NEXT_PUBLIC_API_URL ||
      'http://localhost:5000';

    if (
      currentToken &&
      typeof resource === 'string' &&
      resource.startsWith(apiUrl)
    ) {
      config = config || {};

      config.headers = {
        ...config.headers,
        Authorization:
          `Bearer ${currentToken}`
      };

      args[1] = config;
    }

    return originalFetch.apply(
      this,
      args
    );
  };
}

// ------------------------------------------------------------
// AUTH PROVIDER
// ------------------------------------------------------------

export const AuthProvider = ({
  children
}) => {
  const [user, setUser] =
    useState(null);

  const [loading, setLoading] =
    useState(true);

  const router = useRouter();

  // ----------------------------------------------------------
  // CHECK LOGIN STATUS
  // ----------------------------------------------------------

  useEffect(() => {
    checkUserLoggedIn();
  }, []);

  const checkUserLoggedIn = async () => {
    try {
      const token =
        localStorage.getItem('smack_token');

      if (!token) {
        setUser(null);
        setLoading(false);
        return;
      }

      axios.defaults.headers.common[
        'Authorization'
      ] = `Bearer ${token}`;

      const baseUrl =
        process.env.NEXT_PUBLIC_API_URL ||
        'http://localhost:5000';

      const res = await fetch(
        `${baseUrl}/api/auth/me`,
        {
          headers: {
            Authorization:
              `Bearer ${token}`
          }
        }
      );

      if (res.ok) {
        const data =
          await res.json();

        // Never keep an unverified user
        // authenticated in the frontend.
        if (data.isVerified === false) {
          localStorage.removeItem(
            'smack_token'
          );

          delete axios.defaults.headers
            .common['Authorization'];

          setUser(null);
          return;
        }

        setUser(data);

      } else {
        localStorage.removeItem(
          'smack_token'
        );

        delete axios.defaults.headers
          .common['Authorization'];

        setUser(null);
      }

    } catch (error) {
      console.error(
        'Failed to check auth status:',
        error
      );

      localStorage.removeItem(
        'smack_token'
      );

      delete axios.defaults.headers
        .common['Authorization'];

      setUser(null);

    } finally {
      setLoading(false);
    }
  };

  // ----------------------------------------------------------
  // LOGIN
  // ----------------------------------------------------------

  const login = async ({
    email,
    password
  }) => {
    const baseUrl =
      process.env.NEXT_PUBLIC_API_URL ||
      'http://localhost:5000';

    const res = await fetch(
      `${baseUrl}/api/auth/login`,
      {
        method: 'POST',
        headers: {
          'Content-Type':
            'application/json'
        },
        body: JSON.stringify({
          email,
          password
        })
      }
    );

    const data =
      await res.json();

    if (res.ok) {
      localStorage.setItem(
        'smack_token',
        data.token
      );

      axios.defaults.headers.common[
        'Authorization'
      ] = `Bearer ${data.token}`;

      setUser(data);

      router.push('/');

      return data;
    }

    // Unverified users are sent to the
    // verification information page.
    if (
      res.status === 403 &&
      data.unverified
    ) {
      router.push('/verify');
    }

    throw new Error(
      data.message ||
      'Login failed'
    );
  };

  // ----------------------------------------------------------
  // REGISTER
  // ----------------------------------------------------------

  const register = async ({
    username,
    email,
    password
  }) => {
    const baseUrl =
      process.env.NEXT_PUBLIC_API_URL ||
      'http://localhost:5000';

    const res = await fetch(
      `${baseUrl}/api/auth/register`,
      {
        method: 'POST',
        headers: {
          'Content-Type':
            'application/json'
        },
        body: JSON.stringify({
          username,
          email,
          password
        })
      }
    );

    const data =
      await res.json();

    if (res.ok) {
      // Registration does NOT log the user in.
      // The user must first verify the email.
      router.push('/verify');

      return data;
    }

    throw new Error(
      data.message ||
      'Registration failed'
    );
  };

  // ----------------------------------------------------------
  // LOGOUT
  // ----------------------------------------------------------

  const logout = async () => {
    localStorage.removeItem(
      'smack_token'
    );

    delete axios.defaults.headers
      .common['Authorization'];

    setUser(null);

    router.push('/login');
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        register,
        logout
      }}
    >
      {!loading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = () =>
  useContext(AuthContext);
