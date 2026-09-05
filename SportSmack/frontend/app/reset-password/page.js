'use client';

import { useState } from 'react';
import {
  useSearchParams,
  useRouter
} from 'next/navigation';
import Link from 'next/link';
import axios from 'axios';

export default function ResetPasswordPage() {
  const searchParams =
    useSearchParams();

  const router = useRouter();

  const token =
    searchParams.get('token');

  const [email, setEmail] =
    useState('');

  const [password, setPassword] =
    useState('');

  const [confirmPassword, setConfirmPassword] =
    useState('');

  const [message, setMessage] =
    useState('');

  const [error, setError] =
    useState('');

  const [loading, setLoading] =
    useState(false);

  const isReset =
    Boolean(token);

  const handleForgotPassword =
    async e => {
      e.preventDefault();

      setError('');
      setMessage('');
      setLoading(true);

      try {
        const apiUrl =
          process.env
            .NEXT_PUBLIC_API_URL ||
          'http://localhost:5000';

        const res =
          await axios.post(
            `${apiUrl}/api/auth/forgot-password`,
            { email }
          );

        setMessage(
          res.data.message
        );

      } catch (err) {
        setError(
          err.response?.data?.message ||
          'Unable to process your request.'
        );
      } finally {
        setLoading(false);
      }
    };

  const handleResetPassword =
    async e => {
      e.preventDefault();

      setError('');
      setMessage('');

      if (password.length < 8) {
        setError(
          'Password must be at least 8 characters long.'
        );
        return;
      }

      if (
        password !==
        confirmPassword
      ) {
        setError(
          'Passwords do not match.'
        );
        return;
      }

      setLoading(true);

      try {
        const apiUrl =
          process.env
            .NEXT_PUBLIC_API_URL ||
          'http://localhost:5000';

        const res =
          await axios.post(
            `${apiUrl}/api/auth/reset-password`,
            {
              token,
              password
            }
          );

        setMessage(
          res.data.message
        );

        setTimeout(() => {
          router.push('/login');
        }, 2000);

      } catch (err) {
        setError(
          err.response?.data?.message ||
          'Unable to reset your password.'
        );
      } finally {
        setLoading(false);
      }
    };

  return (
    <div className="auth-container">
      <div className="auth-box">

        <h1 className="auth-title">
          {isReset
            ? 'Reset Password'
            : 'Forgot Password?'}
        </h1>

        {message && (
          <div
            style={{
              padding: '0.75rem',
              marginBottom: '1rem',
              borderRadius: '8px',
              background:
                'rgba(74,222,128,0.1)',
              color: '#4ade80'
            }}
          >
            {message}
          </div>
        )}

        {error && (
          <div className="auth-error">
            {error}
          </div>
        )}

        {!isReset ? (
          <form
            onSubmit={
              handleForgotPassword
            }
            className="auth-form"
          >
            <p
              style={{
                color:
                  'var(--text-secondary)',
                lineHeight: 1.5
              }}
            >
              Enter the email address
              associated with your
              SportSmack account and
              we'll send you a password
              reset link.
            </p>

            <div className="form-group">
              <label htmlFor="email">
                Email
              </label>

              <input
                type="email"
                id="email"
                value={email}
                onChange={e =>
                  setEmail(
                    e.target.value
                  )
                }
                required
              />
            </div>

            <button
              type="submit"
              className="auth-button"
              disabled={loading}
            >
              {loading
                ? 'Sending...'
                : 'Send Reset Link'}
            </button>
          </form>
        ) : (
          <form
            onSubmit={
              handleResetPassword
            }
            className="auth-form"
          >
            <div className="form-group">
              <label htmlFor="password">
                New Password
              </label>

              <input
                type="password"
                id="password"
                value={password}
                onChange={e =>
                  setPassword(
                    e.target.value
                  )
                }
                minLength={8}
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="confirmPassword">
                Confirm Password
              </label>

              <input
                type="password"
                id="confirmPassword"
                value={confirmPassword}
                onChange={e =>
                  setConfirmPassword(
                    e.target.value
                  )
                }
                minLength={8}
                required
              />
            </div>

            <button
              type="submit"
              className="auth-button"
              disabled={loading}
            >
              {loading
                ? 'Resetting...'
                : 'Reset Password'}
            </button>
          </form>
        )}

        <p className="auth-link">
          <Link href="/login">
            Back to Login
          </Link>
        </p>

      </div>
    </div>
  );
}
