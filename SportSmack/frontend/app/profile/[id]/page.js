'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import Link from 'next/link';

export default function UserProfile({ params }) {
  const { id } = params; // This is the user ID from the URL
  const { user: currentUser } = useAuth();
  
  const [profile, setProfile] = useState(null);
  const [friends, setFriends] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('friends');

  const fetchProfileAndFriends = async () => {
    try {
      const [profileRes, friendsRes] = await Promise.all([
        fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'}/api/users/${id}`, { credentials: 'include' }),
        fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'}/api/users/${id}/friends`, { credentials: 'include' })
      ]);

      if (profileRes.ok && friendsRes.ok) {
        setProfile(await profileRes.json());
        setFriends(await friendsRes.json());
      } else {
        setError('User not found or error loading profile');
      }
    } catch (err) {
      setError('Failed to fetch profile data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfileAndFriends();
  }, [id]);

  const handleFriendAction = async (action) => {
    try {
      let method = '';
      if (action === 'ADD') method = 'POST';
      else if (action === 'REMOVE' || action === 'CANCEL') method = 'DELETE';
      else if (action === 'ACCEPT') method = 'PUT';

      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'}/api/users/${id}/friend`, {
        method,
        credentials: 'include'
      });

      if (res.ok) {
        // Refresh profile state
        fetchProfileAndFriends();
      } else {
        const data = await res.json();
        alert(data.message || 'Action failed');
      }
    } catch (err) {
      console.error(err);
      alert('Network error');
    }
  };

  if (loading) return <div className="page-container">Loading...</div>;
  if (error || !profile) return <div className="page-container">{error}</div>;

  const avatarInitials = profile.username.substring(0, 2).toUpperCase();

  return (
    <div className="page-container">
      <div className="profile-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--glass-bg)', backdropFilter: 'blur(10px)', padding: '2rem', borderRadius: '12px', border: '1px solid var(--glass-border)', marginBottom: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: 'linear-gradient(135deg, var(--accent-color), #ff8800)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '2rem', fontWeight: 'bold' }}>
            {avatarInitials}
          </div>
          <div>
            <h1 className="profile-name" style={{ fontSize: '2.5rem', margin: 0 }}>{profile.username}</h1>
            <p className="profile-date" style={{ color: 'var(--text-secondary)' }}>Joined {new Date(profile.created_at).toLocaleDateString()}</p>
          </div>
        </div>

        {profile.relationship !== 'SELF' && (
          <div className="profile-actions">
            {profile.relationship === 'NONE' && (
              <button className="btn-primary" onClick={() => handleFriendAction('ADD')}>
                Add Friend
              </button>
            )}
            {profile.relationship === 'PENDING_SENT' && (
              <button className="btn-secondary" onClick={() => handleFriendAction('CANCEL')}>
                Cancel Request
              </button>
            )}
            {profile.relationship === 'PENDING_RECEIVED' && (
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button className="btn-primary" onClick={() => handleFriendAction('ACCEPT')}>
                  Accept
                </button>
                <button className="btn-secondary" onClick={() => handleFriendAction('REMOVE')}>
                  Decline
                </button>
              </div>
            )}
            {profile.relationship === 'ACCEPTED' && (
              <button className="btn-secondary" style={{ color: 'var(--accent-color)' }} onClick={() => handleFriendAction('REMOVE')}>
                Remove Friend
              </button>
            )}
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 3fr', gap: '2rem', marginBottom: '2rem' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div className="post-card" style={{ padding: '1.5rem', background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
            <h3 style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', marginBottom: '1rem' }}>Stats & Predictions</h3>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
              <span>Total Predictions:</span>
              <span style={{ fontWeight: 'bold' }}>{profile.predictions_total || 0}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
              <span>Win Rate:</span>
              <span style={{ fontWeight: 'bold', color: 'var(--brand-red)' }}>
                {profile.predictions_total > 0 ? Math.round((profile.predictions_won / profile.predictions_total) * 100) : 0}%
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border-color)' }}>
              <span>Biggest Rival:</span>
              <span style={{ fontWeight: 'bold' }}>MockUser123</span>
            </div>
          </div>

          <div className="post-card" style={{ padding: '1.5rem', background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
            <h3 style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', marginBottom: '1rem' }}>Badges</h3>
            {profile.badges && profile.badges.length > 0 ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
                {profile.badges.map(b => (
                  <div key={b.id} title={b.description} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', background: 'var(--bg-primary)', padding: '0.5rem', borderRadius: '8px' }}>
                    <span style={{ fontSize: '2rem' }}>{b.icon}</span>
                    <span style={{ fontSize: '0.7rem', fontWeight: 'bold', textAlign: 'center' }}>{b.badge_name}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ color: 'gray', fontSize: '0.9rem' }}>No badges earned yet.</p>
            )}
          </div>
        </div>

        <div>
          <div className="profile-tabs" style={{ display: 'flex', gap: '1rem', borderBottom: '1px solid var(--border-color)', marginBottom: '2rem' }}>
        <button 
          onClick={() => setActiveTab('friends')} 
          style={{ padding: '1rem', background: 'none', border: 'none', color: activeTab === 'friends' ? 'var(--accent-color)' : 'var(--text-primary)', borderBottom: activeTab === 'friends' ? '2px solid var(--accent-color)' : 'none', cursor: 'pointer', fontWeight: 'bold' }}
        >
          Friends ({friends.length})
        </button>
        <button 
          onClick={() => setActiveTab('activity')} 
          style={{ padding: '1rem', background: 'none', border: 'none', color: activeTab === 'activity' ? 'var(--accent-color)' : 'var(--text-primary)', borderBottom: activeTab === 'activity' ? '2px solid var(--accent-color)' : 'none', cursor: 'pointer', fontWeight: 'bold' }}
        >
          Activity
        </button>
        <button 
          onClick={() => setActiveTab('teams')} 
          style={{ padding: '1rem', background: 'none', border: 'none', color: activeTab === 'teams' ? 'var(--accent-color)' : 'var(--text-primary)', borderBottom: activeTab === 'teams' ? '2px solid var(--accent-color)' : 'none', cursor: 'pointer', fontWeight: 'bold' }}
        >
          Saved Teams ({profile.teams?.length || 0})
        </button>
      </div>

      <div>
        {activeTab === 'friends' ? (
          friends.length > 0 ? (
            <div className="user-list" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem' }}>
              {friends.map(friend => (
                <div key={friend.id} className="post-card" style={{ padding: '1.5rem', textAlign: 'center', background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
                  <div style={{ width: '50px', height: '50px', borderRadius: '50%', background: 'linear-gradient(135deg, #444, #222)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '1.2rem', fontWeight: 'bold', margin: '0 auto 1rem' }}>
                    {friend.username.substring(0, 2).toUpperCase()}
                  </div>
                  <Link href={`/profile/${friend.id}`} style={{ textDecoration: 'none', color: 'var(--text-primary)', fontWeight: 'bold' }}>
                    {friend.username}
                  </Link>
                </div>
              ))}
            </div>
          ) : (
            <div className="post-card" style={{ textAlign: 'center', padding: '3rem', background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
              <p style={{ color: 'var(--text-secondary)' }}>No friends added yet.</p>
            </div>
          )
        ) : activeTab === 'teams' ? (
          profile.teams && profile.teams.length > 0 ? (
            <div className="user-list" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem' }}>
              {profile.teams.map(t => (
                <div key={t.team_id} className="post-card" style={{ padding: '1.5rem', textAlign: 'center', background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
                  {t.team.logo_url && <img src={t.team.logo_url} alt={t.team.name} style={{ width: '64px', height: '64px', objectFit: 'contain' }} />}
                  <span style={{ fontWeight: 'bold' }}>{t.team.name}</span>
                  <span style={{ color: 'gray', fontSize: '0.8rem' }}>
                    {t.team.sport === 'ncaam' ? "Men's Basketball" :
                     t.team.sport === 'ncaaw' ? "Women's Basketball" :
                     t.team.sport === 'ncaaf' ? "Football" :
                     t.team.sport === 'ncaab' ? "Baseball" :
                     t.team.sport} - {t.team.city}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="post-card" style={{ textAlign: 'center', padding: '3rem', background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
              <p style={{ color: 'var(--text-secondary)' }}>No saved teams.</p>
            </div>
          )
        ) : (
          <div className="post-card" style={{ textAlign: 'center', padding: '3rem', background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
            <p style={{ color: 'var(--text-secondary)' }}>Activity feed coming soon.</p>
          </div>
        )}
      </div>
    </div>
  </div>
</div>
  );
}
