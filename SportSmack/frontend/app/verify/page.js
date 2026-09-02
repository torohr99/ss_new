'use client';

import {
  useState,
  useEffect
} from 'react';

import {
  useRouter,
  useSearchParams
} from 'next/navigation';

import axios from 'axios';

export default function VerifyPage() {
  const [status, setStatus] =
    useState('checking');

  const searchParams =
    useSearchParams();

  const router = useRouter();

  useEffect(() => {
    const token =
      searchParams.get('token');

    // --------------------------------------------------------
    // NO TOKEN
    // --------------------------------------------------------
    //
    // This is the page a newly registered user sees while
    // waiting for the verification email.
    //

    if (!token) {
      setStatus('waiting');
      return;
    }

    // --------------------------------------------------------
    // VERIFY TOKEN
    // --------------------------------------------------------

    const verifyEmail = async () => {
      try {
        const baseUrl =
          process.env.NEXT_PUBLIC_API_URL ||
          'http://localhost:5000';

        const res =
          await axios.get(
            `${baseUrl}/api/auth/verify/${encodeURIComponent(token)}`
          );

        setStatus(
          res.data.message ||
          'Account verified successfully!'
        );

        // Send verified user to login.
        setTimeout(() => {
          router.push('/login');
        }, 2500);

      } catch (error) {
        console.error(
          'Email verification failed:',
          error
        );

        setStatus(
          error.response?.data?.message ||
          'Verification failed. Please try again.'
        );
      }
    };

    verifyEmail();

  }, [searchParams, router]);

  // ----------------------------------------------------------
  // WAITING FOR EMAIL
  // ----------------------------------------------------------

  if (status === 'waiting') {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '100vh',
          padding: '2rem'
        }}
      >
        <div
          style={{
            background:
              'var(--glass-bg)',
            border:
              '1px solid var(--glass-border)',
            borderRadius: '12px',
            padding: '3rem',
            textAlign: 'center',
            maxWidth: '500px',
            width: '100%'
          }}
        >
          <h2
            style={{
              marginBottom: '1rem',
              color:
                'var(--primary-color)'
            }}
          >
            Check Your Email
          </h2>

          <p
            style={{
              fontSize: '1.1rem',
              opacity: 0.9,
              lineHeight: 1.6
            }}
          >
            We sent a verification link
            to the email address you
            provided.
          </p>

          <p
            style={{
              fontSize: '0.95rem',
              opacity: 0.75,
              marginTop: '1rem',
              lineHeight: 1.6
            }}
          >
            Click the link in that email
            to verify your SportSmack
            account. You will not be able
            to log in until your email is
            verified.
          </p>

          <p
            style={{
              fontSize: '0.85rem',
              opacity: 0.6,
              marginTop: '1.5rem'
            }}
          >
            Don't see it? Check your spam
            or junk folder.
          </p>

          <button
            onClick={() =>
              router.push('/login')
            }
            style={{
              marginTop: '1.5rem',
              padding:
                '0.75rem 1.5rem',
              borderRadius: '8px',
              border: 'none',
              cursor: 'pointer'
            }}
          >
            Back to Login
          </button>
        </div>
      </div>
    );
  }

  // ----------------------------------------------------------
  // VERIFYING
  // ----------------------------------------------------------

  if (status === 'checking') {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '100vh',
          padding: '2rem'
        }}
      >
        <div
          style={{
            background:
              'var(--glass-bg)',
            border:
              '1px solid var(--glass-border)',
            borderRadius: '12px',
            padding: '3rem',
            textAlign: 'center',
            maxWidth: '500px',
            width: '100%'
          }}
        >
          <h2
            style={{
              marginBottom: '1rem',
              color:
                'var(--primary-color)'
            }}
          >
            Verifying Your Email
          </h2>

          <p
            style={{
              fontSize: '1.1rem',
              opacity: 0.9
            }}
          >
            Please wait...
          </p>
        </div>
      </div>
    );
  }

  // ----------------------------------------------------------
  // SUCCESS
  // ----------------------------------------------------------

  if (
    status.toLowerCase().includes(
      'success'
    ) ||
    status.toLowerCase().includes(
      'verified'
    )
  ) {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '100vh',
          padding: '2rem'
        }}
      >
        <div
          style={{
            background:
              'var(--glass-bg)',
            border:
              '1px solid var(--glass-border)',
            borderRadius: '12px',
            padding: '3rem',
            textAlign: 'center',
            maxWidth: '500px',
            width: '100%'
          }}
        >
          <h2
            style={{
              marginBottom: '1rem',
              color:
                'var(--primary-color)'
            }}
          >
            Email Verified!
          </h2>

          <p
            style={{
              fontSize: '1.1rem',
              opacity: 0.9,
              lineHeight: 1.6
            }}
          >
            {status}
          </p>

          <p
            style={{
              fontSize: '0.9rem',
              opacity: 0.7,
              marginTop: '1rem'
            }}
          >
            Redirecting you to the login
            page...
          </p>
        </div>
      </div>
    );
  }

  // ----------------------------------------------------------
  // ERROR
  // ----------------------------------------------------------

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        padding: '2rem'
      }}
    >
      <div
        style={{
          background:
            'var(--glass-bg)',
          border:
            '1px solid var(--glass-border)',
          borderRadius: '12px',
          padding: '3rem',
          textAlign: 'center',
          maxWidth: '500px',
          width: '100%'
        }}
      >
        <h2
          style={{
            marginBottom: '1rem',
            color:
              'var(--primary-color)'
          }}
        >
          Verification Failed
        </h2>

        <p
          style={{
            fontSize: '1.1rem',
            opacity: 0.9,
            lineHeight: 1.6
          }}
        >
          {status}
        </p>

        <button
          onClick={() =>
            router.push('/login')
          }
          style={{
            marginTop: '1.5rem',
            padding:
              '0.75rem 1.5rem',
            borderRadius: '8px',
            border: 'none',
            cursor: 'pointer'
          }}
        >
          Go to Login
        </button>
      </div>
    </div>
  );
}
