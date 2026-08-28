'use client';

import { useAuth } from '../context/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function ProfileRedirect() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      if (user) {
        router.push(`/profile/${user.id}`);
      } else {
        router.push('/login');
      }
    }
  }, [user, loading, router]);

  return (
    <div className="page-container">
      <p>Redirecting to profile...</p>
    </div>
  );
}
