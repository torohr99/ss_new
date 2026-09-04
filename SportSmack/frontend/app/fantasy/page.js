'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';

export default function FantasyDashboard() {
  const router = useRouter();
  const [leagues, setLeagues] = useState([]);
  const [playerCount, setPlayerCount] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isOffseason, setIsOffseason] = useState(true); // Default to true since it's May
  const [devOverride, setDevOverride] = useState(false);
  
  const [newLeagueName, setNewLeagueName] = useState('');
  const [joinLeagueId, setJoinLeagueId] = useState('');
  const [joinTeamName, setJoinTeamName] = useState('');

  useEffect(() => {
    fetchLeagues();
    checkSeasonStatus();
  }, []);

  const checkSeasonStatus = () => {
    try {
      const month = new Date().getMonth(); // 0 = Jan, 11 = Dec
      // NFL offseason is roughly March (2) to August (7)
      setIsOffseason(month >= 2 && month <= 7);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchLeagues = async () => {
    try {
      const res = await axios.get(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'}/api/fantasy/leagues`, { withCredentials: true });
      setLeagues(res.data);
    } catch (err) {
      if (err.response?.status === 401) {
        router.push('/login');
      }
    } finally {
      setLoading(false);
    }
  };

  const deleteLeague = async (leagueId, leagueName) => {
  const confirmed = window.confirm(
    `Delete "${leagueName}"?\n\nThis permanently deletes the league, teams, draft picks, rosters, matchups, transactions, waivers, and trades.`
  );

  if (!confirmed) return;

  try {
    const apiUrl =
      process.env.NEXT_PUBLIC_API_URL ||
      'http://localhost:5000';

    await axios.delete(
      `${apiUrl}/api/fantasy/league/${leagueId}`,
      {
        withCredentials: true
      }
    );

    setLeagues(prev =>
      prev.filter(league => league.id !== leagueId)
    );
  } catch (err) {
    console.error(
      'Delete league failed:',
      err.response?.data || err.message || err
    );

    alert(
      err.response?.data?.error ||
      'Failed to delete league.'
    );
  }
};

  const createLeague = async (e) => {
    e.preventDefault();
    if (!newLeagueName) return;
    try {
      await axios.post(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'}/api/fantasy/league`, { name: newLeagueName }, { withCredentials: true });
      setNewLeagueName('');
      fetchLeagues();
    } catch (err) {
      alert('Failed to create league');
    }
  };

  const joinLeague = async (e) => {
    e.preventDefault();
    if (!joinLeagueId || !joinTeamName) return;
    try {
      await axios.post(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'}/api/fantasy/league/${joinLeagueId}/join`, { teamName: joinTeamName }, { withCredentials: true });
      setJoinLeagueId('');
      setJoinTeamName('');
      fetchLeagues();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to join league');
    }
  };

  const seedPlayers = async () => {
    try {
      alert('Seeding started. This will take a moment.');
  
      const apiUrl =
        process.env.NEXT_PUBLIC_API_URL ||
        'http://localhost:5000';
  
      const res = await axios.post(
        `${apiUrl}/api/fantasy/seed`,
        {},
        { withCredentials: true }
      );
  
      const playersRes = await axios.get(
        `${apiUrl}/api/fantasy/players`,
        { withCredentials: true }
      );
  
      const players = Array.isArray(playersRes.data)
        ? playersRes.data
        : [];
  
      setPlayerCount(players.length);
  
      alert(
        `Seeding complete. ${players.length} NFL players are now available.`
      );
    } catch (err) {
      console.error(
        'Fantasy player seeding failed:',
        err.response?.data || err.message || err
      );
  
      alert(
        err.response?.data?.error ||
        'Seeding failed. Check the Render logs.'
      );
    }
  };

  if (loading) return <div className="fantasy-page">Loading...</div>;

  return (
    <div className="fantasy-page">
      <div className="fantasy-hero">
        <div className="fantasy-eyebrow">
          SportSmack Fantasy
        </div>
      
        <h1>
          Fantasy Football
        </h1>
      
        <div className="fantasy-hero-subtitle">
          Draft your squad. Manage your roster.
          Talk your smack.
        </div>
      
        <div className="fantasy-action-row">
      
          <button
            className="fantasy-button fantasy-button-secondary"
            onClick={() =>
              setDevOverride(!devOverride)
            }
          >
            🛠 Dev Override:{' '}
            {devOverride ? 'ON' : 'OFF'}
          </button>
      
          <button
            className="fantasy-button fantasy-button-secondary"
            onClick={async () => {
              try {
                await axios.post(
                  `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'}/api/fantasy/league/test-bots`,
                  {},
                  {
                    withCredentials: true
                  }
                );
      
                fetchLeagues();
              } catch (err) {
                alert(
                  'Failed to create test league'
                );
              }
            }}
          >
            🤖 Test League
          </button>
      
          <button
            className="fantasy-button fantasy-button-primary"
            onClick={seedPlayers}
          >
            🏈 Sync NFL Players
          </button>
      
          {playerCount !== null && (
            <span
              className="fantasy-status"
            >
              {playerCount} Players
            </span>
          )}
      
        </div>
      </div>

      {isOffseason && !devOverride ? (
        <div className="post-card" style={{ textAlign: 'center', background: 'rgba(230,0,0,0.1)', border: '1px solid var(--brand-red)' }}>
          <h2>NFL is Currently in the Offseason</h2>
          <p style={{ color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
            Fantasy drafting and leagues will open during the Preseason. Use the Dev Override to test the system now.
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', marginTop: '2rem' }}>
          
          <div className="profile-section">
            <h2 className="section-title">My Leagues</h2>
            {leagues.length === 0 ? (
              <p style={{
                color: 'var(--text-secondary)'
              }}>
                You haven't joined any leagues yet.
              </p>
            ) : (
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '1rem'
              }}>
                {leagues.map(l => (
                  <div
                    key={l.id}
                    className="post-card"
                    style={{
                      cursor: 'pointer'
                    }}
                    onClick={() =>
                      router.push(
                        `/fantasy/league/${l.id}`
                      )
                    }
                  >
                    <h3>
                      {l.name}
                    </h3>
            
                    <div style={{
                      color:
                        'var(--text-secondary)'
                    }}>
                      {l.status}
                    </div>
            
                    <div
                      style={{
                        display: 'flex',
                        gap: '0.75rem',
                        marginTop: '0.75rem'
                      }}
                    >
                      <button
                        className="btn-primary"
                        onClick={e => {
                          e.stopPropagation();
                    
                          router.push(
                            `/fantasy/league/${l.id}`
                          );
                        }}
                      >
                        Enter League
                      </button>
                    
                      <button
                        className="btn-secondary"
                        onClick={e => {
                          e.stopPropagation();
                    
                          deleteLeague(l.id, l.name);
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            <div className="profile-section">
              <h2 className="section-title">Create League</h2>
              <form onSubmit={createLeague} style={{ display: 'flex', gap: '1rem' }}>
                <input 
                  type="text" 
                  className="auth-input" 
                  placeholder="League Name" 
                  value={newLeagueName}
                  onChange={(e) => setNewLeagueName(e.target.value)}
                  style={{ flex: 1, margin: 0 }}
                />
                <button type="submit" className="btn-primary">Create</button>
              </form>
            </div>

            <div className="profile-section">
              <h2 className="section-title">Join League</h2>
              <form onSubmit={joinLeague} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <input 
                  type="text" 
                  className="auth-input" 
                  placeholder="League ID" 
                  value={joinLeagueId}
                  onChange={(e) => setJoinLeagueId(e.target.value)}
                  style={{ margin: 0 }}
                />
                <input 
                  type="text" 
                  className="auth-input" 
                  placeholder="Your Team Name" 
                  value={joinTeamName}
                  onChange={(e) => setJoinTeamName(e.target.value)}
                  style={{ margin: 0 }}
                />
                <button type="submit" className="btn-primary">Join</button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
