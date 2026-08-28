'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';

export default function LeaguePage({ params }) {
  const { id } = params;
  const router = useRouter();
  const [league, setLeague] = useState(null);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    fetchLeague();
    fetchUser();
  }, [id]);

  const fetchUser = async () => {
    try {
      const res = await axios.get(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'}/api/users/profile`, { withCredentials: true });
      setCurrentUser(res.data);
    } catch (err) {}
  };

  const fetchLeague = async () => {
    try {
      const res = await axios.get(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'}/api/fantasy/league/${id}`, { withCredentials: true });
      setLeague(res.data);
    } catch (err) {
      if (err.response?.status === 401) router.push('/login');
    } finally {
      setLoading(false);
    }
  };

  const setRosterStatus = async (teamId, teamPlayerId, status) => {
    try {
      await axios.post(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'}/api/fantasy/team/${teamId}/roster`, { teamPlayerId, status }, { withCredentials: true });
      fetchLeague(); // Refresh
    } catch (err) {
      alert('Failed to update roster');
    }
  };

  if (loading) return <div className="page-container">Loading...</div>;
  if (!league) return <div className="page-container">League not found</div>;

  const myTeam = league.teams.find(t => t.userId === currentUser?.id);

  return (
    <div className="page-container">
      <div className="feed-header" style={{ marginBottom: '2rem' }}>
        <div>
          <h1>{league.name}</h1>
          <div style={{ color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
            ID: {league.id} • Status: <span style={{ color: 'var(--brand-red)' }}>{league.status}</span>
          </div>
        </div>
        
        {(league.status === 'PREDRAFT' || league.status === 'DRAFTING') && (
          <button 
            className="btn-primary" 
            style={{ fontSize: '1.2rem', padding: '1rem 2rem' }}
            onClick={() => router.push(`/fantasy/draft/${league.id}`)}
          >
            Enter Draft Room
          </button>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '2rem' }}>
        {/* Teams and Rosters */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          {league.teams.map(team => {
            const isMyTeam = team.id === myTeam?.id;
            // Calculate total points for this week (or all time)
            const totalPoints = team.weeklyScores.reduce((sum, ws) => sum + ws.points, 0);
            
            return (
              <div key={team.id} className="post-card" style={{ border: isMyTeam ? '2px solid var(--brand-red)' : 'none' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}>
                  <h2 style={{ margin: 0 }}>{team.name} <span style={{ fontSize: '1rem', color: 'var(--text-secondary)', fontWeight: 'normal' }}>({team.user.username})</span></h2>
                  <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--brand-red)' }}>{totalPoints.toFixed(1)} pts</div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {team.players.length === 0 ? (
                    <div style={{ color: 'var(--text-secondary)' }}>No players drafted yet.</div>
                  ) : (
                    team.players.map(tp => (
                      <div key={tp.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-secondary)', padding: '0.8rem', borderRadius: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                          {tp.player.imageUrl && <img src={tp.player.imageUrl} alt="" style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#fff' }} />}
                          <div>
                            <div style={{ fontWeight: 'bold' }}>{tp.player.name}</div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{tp.player.position} - {tp.player.team}</div>
                          </div>
                        </div>
                        
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                          <span style={{ 
                            padding: '0.2rem 0.5rem', 
                            borderRadius: '4px', 
                            fontSize: '0.8rem',
                            fontWeight: 'bold',
                            background: tp.status === 'STARTER' ? 'rgba(0, 255, 0, 0.1)' : 'rgba(255, 255, 255, 0.1)',
                            color: tp.status === 'STARTER' ? '#4ade80' : 'var(--text-secondary)'
                          }}>
                            {tp.status}
                          </span>
                          
                          {isMyTeam && (
                            <button 
                              className="btn-secondary" 
                              style={{ padding: '0.3rem 0.8rem', fontSize: '0.8rem' }}
                              onClick={() => setRosterStatus(team.id, tp.id, tp.status === 'STARTER' ? 'BENCH' : 'STARTER')}
                            >
                              Move to {tp.status === 'STARTER' ? 'Bench' : 'Start'}
                            </button>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Standings Sidebar */}
        <div>
          <div className="profile-section" style={{ position: 'sticky', top: '100px' }}>
            <h2 className="section-title">Standings</h2>
            {league.teams
              .sort((a, b) => {
                const ptsA = a.weeklyScores.reduce((sum, ws) => sum + ws.points, 0);
                const ptsB = b.weeklyScores.reduce((sum, ws) => sum + ws.points, 0);
                return ptsB - ptsA;
              })
              .map((t, index) => {
                const pts = t.weeklyScores.reduce((sum, ws) => sum + ws.points, 0);
                return (
                  <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.8rem 0', borderBottom: '1px solid var(--border)' }}>
                    <div>
                      <span style={{ color: 'var(--text-secondary)', marginRight: '0.5rem' }}>{index + 1}.</span>
                      {t.name}
                    </div>
                    <div style={{ fontWeight: 'bold' }}>{pts.toFixed(1)}</div>
                  </div>
                );
              })}
          </div>
        </div>
      </div>
    </div>
  );
}
