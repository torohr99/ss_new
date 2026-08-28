'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import TeamCalendar from '../../../components/TeamCalendar';
import NewsCard from '../../../components/NewsCard';

export default function TeamPage({ params }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { id } = params;
  const [team, setTeam] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isFollowing, setIsFollowing] = useState(false);
  
  const initialCollegeSport = searchParams.get('collegeSport') || 'ncaam';
  const [collegeSport, setCollegeSport] = useState(initialCollegeSport);

  useEffect(() => {
    const fetchTeam = async () => {
      setLoading(true);
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'}/api/teams/${id}?collegeSport=${collegeSport}`, {
          credentials: 'include'
        });
        if (res.ok) {
          const data = await res.json();
          setTeam(data);
          setIsFollowing(data.isFollowing);
        } else {
          setError('Team not found');
        }
      } catch (err) {
        setError('Error loading team');
      } finally {
        setLoading(false);
      }
    };

    fetchTeam();
  }, [id, collegeSport]);

  const toggleFollow = async () => {
    const originalState = isFollowing;
    setIsFollowing(!originalState); // Optimistic UI update

    try {
      const method = originalState ? 'DELETE' : 'POST';
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'}/api/teams/${id}/follow?collegeSport=${collegeSport}`, {
        method,
        credentials: 'include'
      });

      if (!res.ok) {
        setIsFollowing(originalState); // Revert on failure
      }
    } catch (err) {
      setIsFollowing(originalState);
    }
  };

  if (loading) return <div className="page-container">Loading...</div>;
  if (error || !team) return <div className="page-container">{error}</div>;

  // Determine gradient colors
  let color1 = 'E60000'; // Brand red fallback
  let color2 = '121212'; // Dark fallback
  
  if (team.stats?.color) {
    color1 = team.stats.color;
    color2 = team.stats.alternateColor || '121212';
  }

  const gradientStyle = {
    background: `linear-gradient(135deg, #${color1}, #${color2})`
  };

  const renderGameCard = (title, game) => (
    <div 
      className="schedule-card" 
      onClick={() => game ? router.push(`/game/${team.leagueKey}/${game.id}`) : null}
      style={{ cursor: game ? 'pointer' : 'default' }}
    >
      <div className="schedule-label">{title}</div>
      {game ? (
        <div className="schedule-content">
          <div className="schedule-team-row">
            <div className="schedule-team-left">
              <img src={game.awayTeam.logo} alt="" className="schedule-team-logo" />
              <span className="schedule-team-name">{game.awayTeam.name}</span>
            </div>
            {game.awayTeam.score !== undefined && game.awayTeam.score !== null && (
              <span className={`schedule-team-score ${game.awayTeam.winner ? 'winner' : ''}`}>
                {typeof game.awayTeam.score === 'object' ? game.awayTeam.score.displayValue || game.awayTeam.score.value : game.awayTeam.score}
              </span>
            )}
          </div>
          <div style={{ paddingLeft: '2rem', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>@</div>
          <div className="schedule-team-row">
            <div className="schedule-team-left">
              <img src={game.homeTeam.logo} alt="" className="schedule-team-logo" />
              <span className="schedule-team-name">{game.homeTeam.name}</span>
            </div>
            {game.homeTeam.score !== undefined && game.homeTeam.score !== null && (
              <span className={`schedule-team-score ${game.homeTeam.winner ? 'winner' : ''}`}>
                {typeof game.homeTeam.score === 'object' ? game.homeTeam.score.displayValue || game.homeTeam.score.value : game.homeTeam.score}
              </span>
            )}
          </div>
          <div className="schedule-meta">
            {new Date(game.date).toLocaleDateString()} • {game.status}
          </div>
        </div>
      ) : (
        <div style={{ color: 'var(--text-secondary)', fontStyle: 'italic', flex: 1, display: 'flex', alignItems: 'center' }}>
          No game found
        </div>
      )}
    </div>
  );

  return (
    <div className="page-container">
      {/* Header */}
      <div className="team-header-dynamic" style={gradientStyle}>
        <img src={team.logo_url} alt={`${team.name} logo`} className="team-header-logo" />
        <h1 className="team-header-name">{team.city} {team.name}</h1>
        <div className="team-header-sport">{team.sport}</div>
        
        <button 
          className={`btn-follow ${isFollowing ? 'following' : ''}`}
          onClick={toggleFollow}
        >
          {isFollowing ? 'Following' : 'Follow Team'}
        </button>
      </div>

      {team.sport === 'College' && (
        <div className="college-sport-tabs" style={{ display: 'flex', gap: '1rem', marginTop: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
          {['ncaam', 'ncaaw', 'ncaaf', 'ncaab'].map(sportKey => {
            const labels = { ncaam: 'Men\'s Basketball', ncaaw: 'Women\'s Basketball', ncaaf: 'Football', ncaab: 'Baseball' };
            const isActive = collegeSport === sportKey;
            return (
              <button 
                key={sportKey}
                onClick={() => setCollegeSport(sportKey)}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontSize: '1rem', fontWeight: isActive ? 'bold' : 'normal',
                  color: isActive ? `var(--brand-color)` : 'var(--text-secondary)',
                  borderBottom: isActive ? `2px solid var(--brand-color)` : 'none',
                  padding: '0.5rem 1rem'
                }}
              >
                {labels[sportKey]}
              </button>
            );
          })}
        </div>
      )}

      {/* Stats Strip */}
      {team.stats && (
        <div className="team-stats-strip">
          <div className="stat-box">
            <div className="stat-box-label">Overall</div>
            <div className="stat-box-value">{typeof team.stats.wins === 'object' ? team.stats.wins.displayValue || team.stats.wins.value : team.stats.wins}-{typeof team.stats.losses === 'object' ? team.stats.losses.displayValue || team.stats.losses.value : team.stats.losses}</div>
          </div>
          <div className="stat-box">
            <div className="stat-box-label">Home</div>
            <div className="stat-box-value">{typeof team.stats.homeRecord === 'object' ? team.stats.homeRecord.displayValue || team.stats.homeRecord.value : team.stats.homeRecord}</div>
          </div>
          <div className="stat-box">
            <div className="stat-box-label">Away</div>
            <div className="stat-box-value">{typeof team.stats.awayRecord === 'object' ? team.stats.awayRecord.displayValue || team.stats.awayRecord.value : team.stats.awayRecord}</div>
          </div>
          <div className="stat-box">
            <div className="stat-box-label">Streak</div>
            <div className="stat-box-value">{typeof team.stats.streak === 'object' ? team.stats.streak.displayValue || team.stats.streak.value : team.stats.streak}</div>
          </div>
        </div>
      )}

      {/* Schedule */}
      {team.schedule && (
        <>
          <h2 className="section-title">Schedule</h2>
          <div className="schedule-grid">
            {renderGameCard("Last Game", team.schedule.lastGame)}
            {renderGameCard("Today", team.schedule.todayGame)}
            {renderGameCard("Next Game", team.schedule.nextGame)}
          </div>
          
          <TeamCalendar allGames={team.schedule.allGames} />
        </>
      )}

      {/* Team Feed */}
      <h2 className="section-title" style={{ marginTop: '3rem' }}>Team Feed</h2>
      {team.news && team.news.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', marginBottom: '3rem' }}>
          {team.news.map(article => (
            <NewsCard key={`news_${article.id}`} article={article} />
          ))}
        </div>
      ) : (
        <div className="post-card" style={{ textAlign: 'center', padding: '3rem' }}>
          <p className="post-body">No recent news or posts for this team.</p>
        </div>
      )}
    </div>
  );
}
