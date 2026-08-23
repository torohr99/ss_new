'use client';
import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import axios from 'axios';

export default function VerifyPage() {
  const [status, setStatus] = useState('Verifying your account...');
  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    const token = searchParams.get('token');
    if (!token) {
      setStatus('Invalid verification link.');
      return;
    }

    axios.get(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'}/api/auth/verify/${token}`)
      .then(res => {
        setStatus(res.data.message || 'Account verified successfully!');
        setTimeout(() => {
          router.push('/');
        }, 3000);
      })
      .catch(err => {
        setStatus(err.response?.data?.message || 'Verification failed. Please try again.');
      });
  }, [searchParams, router]);

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', padding: '2rem' }}>
      <div style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: '12px', padding: '3rem', textAlign: 'center', maxWidth: '400px', width: '100%' }}>
        <h2 style={{ marginBottom: '1rem', color: 'var(--primary-color)' }}>Account Verification</h2>
        <p style={{ fontSize: '1.1rem', opacity: 0.9 }}>{status}</p>
        
        {status.includes('success') && (
          <p style={{ fontSize: '0.9rem', opacity: 0.7, marginTop: '1rem' }}>Redirecting you to the home page...</p>
        )}
      </div>
    </div>
  );
}
