'use client';

import Link from 'next/link';
import { useAuth } from '../app/context/AuthContext';
import GlobalSearch from './GlobalSearch';

export default function Header() {
  const { user, logout } = useAuth();

  return (
    <header className="header" style={{ justifyContent: 'space-between' }}>
      <div style={{ display: 'flex', gap: '2rem', alignItems: 'center' }}>
        <Link href="/" className="header-logo">
          SportSmack
        </Link>
        {user && (
          <Link href="/scores" style={{ textDecoration: 'none', color: 'var(--text-secondary)', fontWeight: '500' }}>
            Scores
          </Link>
        )}
      </div>
      
      {user && <GlobalSearch />}

      <div className="header-actions" style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
        {user ? (
          <>
            <Link href="/settings" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', textDecoration: 'none', color: 'var(--text-primary)' }}>
              {user.profile_pic ? (
                <img src={user.profile_pic} alt="Profile" style={{ width: '32px', height: '32px', borderRadius: '50%', objectFit: 'cover' }} />
              ) : (
                <span style={{ fontWeight: '500' }}>Settings</span>
              )}
            </Link>
            <button onClick={logout} style={{ padding: '0.5rem 1rem', background: 'transparent', border: '1px solid var(--border-color)', borderRadius: '6px', cursor: 'pointer', color: 'var(--text-primary)' }}>
              Logout
            </button>
          </>
        ) : (
          <>
            <Link href="/login" style={{ textDecoration: 'none', color: 'var(--text-primary)', fontWeight: '500' }}>Login</Link>
            <Link href="/signup" style={{ textDecoration: 'none', background: 'var(--accent-color)', color: 'white', padding: '0.5rem 1rem', borderRadius: '6px', fontWeight: '500' }}>Sign Up</Link>
          </>
        )}
      </div>
    </header>
  );
}
