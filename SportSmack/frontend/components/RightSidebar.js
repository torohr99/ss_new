'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '../app/context/AuthContext';

export default function RightSidebar() {
  const { user } = useAuth();
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [activeAnalysis, setActiveAnalysis] = useState(null);

  useEffect(() => {
    if (user) {
      fetchMyTeams();
    }
  }, [user]);

  const fetchMyTeams = async () => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'}/api/users/me/teams/details`, {
        credentials: 'include'
      });
      if (res.ok) {
        const data = await res.json();
        setTeams(data);
      }
    } catch (err) {
      console.error('Failed to fetch teams', err);
    } finally {
      setLoading(false);
    }
  };

  const handleFetchAnalysis = async (leagueKey, gameId) => {
    setAnalysisLoading(true);
    setActiveAnalysis(null);

    try {
        const res = await fetch(
            `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'}/api/gamecast/${leagueKey}/${gameId}/pregame-analysis`,
            {
                credentials: 'include'
            }
        );

        const data = await res.json();

        if (!res.ok) {
            throw new Error(
                data.message || 'Unable to generate analysis'
            );
        }

        setActiveAnalysis(data);

    } catch (err) {
        console.error('Failed to fetch AI pre-game analysis:', err);

        setActiveAnalysis({
            error: 'AI analysis is unavailable at this time.'
        });

    } finally {
        setAnalysisLoading(false);
    }
};

  if (!user) return null;

  return (
    <aside className="right-sidebar">
      <h3 style={{ fontSize: '1.2rem', fontWeight: '700', marginBottom: '1.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>My Teams</h3>
      
      {loading ? (
        <div style={{ color: 'var(--text-secondary)' }}>Loading your teams...</div>
      ) : teams.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {teams.map(team => {
            const game = team.schedule?.todayGame || team.schedule?.nextGame;
            let homeLeading = false;
            let awayLeading = false;
            
            if (game && game.homeTeam?.score !== undefined && game.awayTeam?.score !== undefined) {
              const homeScore = parseInt(game.homeTeam.score) || 0;
              const awayScore = parseInt(game.awayTeam.score) || 0;
              if (homeScore > awayScore) homeLeading = true;
              if (awayScore > homeScore) awayLeading = true;
            }

            return (
              <div key={team.id} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', padding: '1rem', background: 'var(--primary-bg)', borderRadius: '12px', border: `1px solid #${team.color || '333'}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <img src={team.logo_url} alt={team.name} style={{ width: '32px', height: '32px', borderRadius: '50%', objectFit: 'cover' }} />
                  <Link href={`/team/${team.id}${['ncaam','ncaaw','ncaaf','ncaab'].includes(team.leagueKey) ? '?collegeSport=' + team.leagueKey : ''}`} style={{ fontWeight: '600', color: 'var(--text-primary)', textDecoration: 'none' }}>
                    {team.city} {team.name}
                  </Link>
                </div>
                
                {game ? (
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.5rem', background: 'var(--secondary-bg)', padding: '0.5rem', borderRadius: '8px' }}>
                    <div style={{ fontWeight: '600', color: 'var(--text-primary)', marginBottom: '0.25rem' }}>
                      {game.status}
                    </div>
                    <div>{game.shortName}</div>
                    {(game.homeTeam?.score !== undefined || game.awayTeam?.score !== undefined) && (
                      <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', color: awayLeading ? 'var(--text-primary)' : 'var(--text-secondary)', fontWeight: awayLeading ? 'bold' : 'normal' }}>
                          <span>{game.awayTeam.name}</span>
                          <span>{game.awayTeam.score}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', color: homeLeading ? 'var(--text-primary)' : 'var(--text-secondary)', fontWeight: homeLeading ? 'bold' : 'normal' }}>
                          <span>{game.homeTeam.name}</span>
                          <span>{game.homeTeam.score}</span>
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                          <Link 
                            href={`/game/${team.leagueKey}/${game.id}`}
                            className="btn-primary"
                            style={{
                              flex: 1,
                              padding: '0.4rem 0',
                              textAlign: 'center',
                              textDecoration: 'none',
                              fontSize: '0.85rem'
                            }}
                          >
                            Live Chat
                          </Link>
                          <button
                            onClick={() => handleFetchAnalysis(team.leagueKey, game.id)}
                            className="btn-secondary"
                            style={{
                              flex: 1,
                              padding: '0.4rem 0',
                              textAlign: 'center',
                              fontSize: '0.85rem'
                            }}
                          >
                            AI Analysis
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>No upcoming games</div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
          You aren't following any teams yet. Head over to <Link href="/explore" style={{ color: 'var(--accent-color)' }}>Explore</Link> to find your favorites!
        </div>
      )}

      {/* AI Analysis Modal */}
      {(activeAnalysis || analysisLoading) && (
        <div style={{
          position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', 
          backgroundColor: 'rgba(0,0,0,0.8)', zIndex: 9999, 
          display: 'flex', justifyContent: 'center', alignItems: 'center'
        }}>
          <div style={{
            background: 'var(--primary-bg)', border: '1px solid var(--border-color)', 
            borderRadius: '12px', padding: '2rem', maxWidth: '600px', width: '90%',
            position: 'relative', maxHeight: '80vh', overflowY: 'auto'
          }}>
            <button 
              onClick={() => { setActiveAnalysis(null); setAnalysisLoading(false); }}
              style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'none', border: 'none', color: 'var(--text-primary)', fontSize: '1.5rem', cursor: 'pointer' }}
            >
              &times;
            </button>
            <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: 0 }}>
              🤖 AI Pre-Game Analysis
            </h2>
            {analysisLoading ? (

              <div
                  style={{
                      textAlign: 'center',
                      padding: '2rem 0',
                      color: 'var(--text-secondary)'
                  }}
              >
                  <p>Generating matchup-specific AI analysis...</p>
              </div>
          
          ) : activeAnalysis?.error ? (
          
              <div
                  style={{
                      padding: '1rem',
                      color: 'var(--text-secondary)'
                  }}
              >
                  {activeAnalysis.error}
              </div>
          
          ) : activeAnalysis ? (
          
              <div
                  style={{
                      lineHeight: '1.6',
                      color: 'var(--text-primary)'
                  }}
              >
          
                  {activeAnalysis.analysis?.headline && (
                      <h3 style={{ marginTop: 0 }}>
                          {activeAnalysis.analysis.headline}
                      </h3>
                  )}
          
                  {activeAnalysis.analysis?.summary && (
                      <p>
                          {activeAnalysis.analysis.summary}
                      </p>
                  )}
          
                  {activeAnalysis.analysis?.keyMatchup && (
                      <div style={{ marginTop: '1.25rem' }}>
                          <h4>Key Matchup</h4>
          
                          <strong>
                              {activeAnalysis.analysis.keyMatchup.title}
                          </strong>
          
                          <p>
                              {activeAnalysis.analysis.keyMatchup.analysis}
                          </p>
          
                          {activeAnalysis.analysis.keyMatchup.evidence?.length > 0 && (
                              <ul>
                                  {activeAnalysis.analysis.keyMatchup.evidence.map(
                                      (item, index) => (
                                          <li key={index}>{item}</li>
                                      )
                                  )}
                              </ul>
                          )}
                      </div>
                  )}
          
                  {activeAnalysis.analysis?.mostImportantFactor && (
                      <div style={{ marginTop: '1.25rem' }}>
                          <h4>Most Important Factor</h4>
                          <p>
                              {activeAnalysis.analysis.mostImportantFactor}
                          </p>
                      </div>
                  )}
          
                  {activeAnalysis.analysis?.prediction && (
                      <div
                          style={{
                              marginTop: '1.25rem',
                              padding: '1rem',
                              background: 'rgba(255,255,255,0.05)',
                              borderRadius: '8px'
                          }}
                      >
                          <h4 style={{ marginTop: 0 }}>
                              AI Prediction
                          </h4>
          
                          <div style={{ fontSize: '1.1rem', fontWeight: '700' }}>
                              {activeAnalysis.analysis.prediction.winner}
                          </div>
          
                          <div
                              style={{
                                  fontSize: '0.85rem',
                                  opacity: 0.75,
                                  marginTop: '0.25rem'
                              }}
                          >
                              {activeAnalysis.analysis.prediction.confidence}% confidence
                          </div>
          
                          <p>
                              {activeAnalysis.analysis.prediction.reason}
                          </p>
                      </div>
                  )}
          
                  {activeAnalysis.analysis?.watchFor?.length > 0 && (
                      <div style={{ marginTop: '1.25rem' }}>
                          <h4>What to Watch For</h4>
          
                          <ul>
                              {activeAnalysis.analysis.watchFor.map(
                                  (item, index) => (
                                      <li key={index}>{item}</li>
                                  )
                              )}
                          </ul>
                      </div>
                  )}
          
              </div>
          
          ) : null}
          </div>
        </div>
      )}
    </aside>
  );
}
