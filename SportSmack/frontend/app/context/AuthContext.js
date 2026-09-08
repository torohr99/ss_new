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

      const baseUrl =
        process.env.NEXT_PUBLIC_API_URL ||
        'http://localhost:5000';

      const res = await fetch(
        `${baseUrl}/api/auth/me`,
        {
          credentials: 'include'
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
        credentials: 'include',
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
  try {
    const baseUrl =
      process.env.NEXT_PUBLIC_API_URL ||
      'http://localhost:5000';

    await fetch(
      `${baseUrl}/api/auth/logout`,
      {
        method: 'POST',
        credentials: 'include'
      }
    );
  } catch (error) {
    console.error(
      'Logout request failed:',
      error
    );
  }

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
