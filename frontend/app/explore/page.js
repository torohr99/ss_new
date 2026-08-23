'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

export default function Explore() {
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState([]);
  const [teams, setTeams] = useState([]);
  const [activeTab, setActiveTab] = useState('teams');
  const [loadingTeams, setLoadingTeams] = useState(true);

  useEffect(() => {
    // Fetch all teams once
    const fetchAllTeams = async () => {
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'}/api/teams`, { credentials: 'include' });
        if (res.ok) {
          setTeams(await res.json());
        }
      } catch (err) {
        console.error('Failed to fetch teams', err);
      } finally {
        setLoadingTeams(false);
      }
    };
    fetchAllTeams();
  }, []);

  useEffect(() => {
    const fetchUsers = async () => {
      if (query.trim() === '') {
        setUsers([]);
        return;
      }
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'}/api/users/search?q=${encodeURIComponent(query)}`, {
          credentials: 'include'
        });
        if (res.ok) {
          setUsers(await res.json());
        }
      } catch (err) {
        console.error('Failed to search users', err);
      }
    };

    const timerId = setTimeout(() => {
      fetchUsers();
    }, 300);

    return () => clearTimeout(timerId);
  }, [query]);

  // Group teams by sport
  const groupedTeams = teams.reduce((acc, team) => {
    const sport = team.sport || 'Other';
    if (!acc[sport]) acc[sport] = [];
    acc[sport].push(team);
    return acc;
  }, {});

  return (
    <div className="page-container">
      <div className="feed-header">
        <h1>Explore</h1>
      </div>

      <div className="profile-tabs" style={{ display: 'flex', gap: '1rem', borderBottom: '1px solid var(--border-color)', marginBottom: '2rem' }}>
        <button 
          onClick={() => setActiveTab('teams')} 
          style={{ padding: '1rem', background: 'none', border: 'none', color: activeTab === 'teams' ? 'var(--accent-color)' : 'var(--text-primary)', borderBottom: activeTab === 'teams' ? '2px solid var(--accent-color)' : 'none', cursor: 'pointer', fontWeight: 'bold' }}
        >
          Team Directory
        </button>
        <button 
          onClick={() => setActiveTab('users')} 
          style={{ padding: '1rem', background: 'none', border: 'none', color: activeTab === 'users' ? 'var(--accent-color)' : 'var(--text-primary)', borderBottom: activeTab === 'users' ? '2px solid var(--accent-color)' : 'none', cursor: 'pointer', fontWeight: 'bold' }}
        >
          User Search
        </button>
      </div>

      {activeTab === 'users' && (
        <div>
          <input 
            type="text" 
            className="search-input" 
            placeholder="Search for a username..." 
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ width: '100%', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--primary-bg)', color: 'var(--text-primary)', marginBottom: '2rem' }}
          />

          <div className="user-list" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '1rem' }}>
            {users.length > 0 ? (
              users.map(user => (
                <div key={user.id} className="post-card" style={{ padding: '1.5rem', textAlign: 'center', background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
                  <div style={{ width: '50px', height: '50px', borderRadius: '50%', background: 'linear-gradient(135deg, #444, #222)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '1.2rem', fontWeight: 'bold', margin: '0 auto 1rem' }}>
                    {user.username.substring(0, 2).toUpperCase()}
                  </div>
                  <Link href={`/profile/${user.id}`} style={{ textDecoration: 'none', color: 'var(--text-primary)', fontWeight: 'bold', fontSize: '1.1rem' }}>
                    {user.username}
                  </Link>
                  <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '0.5rem' }}>Joined {new Date(user.created_at).toLocaleDateString()}</div>
                </div>
              ))
            ) : query ? (
              <p style={{ color: 'var(--text-secondary)' }}>No users found matching "{query}"</p>
            ) : (
              <p style={{ color: 'var(--text-secondary)' }}>Start typing to search for users.</p>
            )}
          </div>
        </div>
      )}

      {activeTab === 'teams' && (
        <div>
          {loadingTeams ? (
            <div className="skeleton" style={{ height: '200px', width: '100%', borderRadius: '12px' }}></div>
          ) : (
            Object.entries(groupedTeams).map(([sport, sportTeams]) => (
              <div key={sport} style={{ marginBottom: '3rem' }}>
                <h2 style={{ marginBottom: '1.5rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '1px', fontSize: '1rem' }}>{sport}</h2>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '1rem' }}>
                  {sportTeams.map(team => (
                    <Link href={`/team/${team.id}`} key={team.id} style={{ textDecoration: 'none' }}>
                      <div className="post-card" style={{ padding: '1.5rem', textAlign: 'center', background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', cursor: 'pointer', transition: 'transform 0.2s' }} onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-4px)'} onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}>
                        <img 
                          src={team.logo_url && !team.logo_url.includes('placeholder') ? team.logo_url : 'https://via.placeholder.com/60'} 
                          alt="" 
                          style={{ width: '60px', height: '60px', objectFit: 'contain', margin: '0 auto 1rem', display: 'block' }}
                          onError={(e) => e.target.style.display = 'none'}
                        />
                        <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{team.city}</div>
                        <div style={{ color: 'var(--text-primary)', fontWeight: 'bold', fontSize: '1.1rem' }}>{team.name}</div>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
