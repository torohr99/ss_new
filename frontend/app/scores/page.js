'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

const LEAGUES = [
  { id: 'nfl', name: 'NFL' },
  { id: 'nba', name: 'NBA' },
  { id: 'mlb', name: 'MLB' },
  { id: 'nhl', name: 'NHL' },
  { id: 'wnba', name: 'WNBA' },
  { id: 'premier-league', name: 'Premier League' }
];

export default function ScoresPage() {
  const [activeLeague, setActiveLeague] = useState('nba');
  const [scoreboard, setScoreboard] = useState([]);
  const [standings, setStandings] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData(activeLeague);
  }, [activeLeague]);

  const fetchData = async (league) => {
    setLoading(true);
    try {
      const [scoreRes, standRes] = await Promise.all([
        fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'}/api/sports/${league}/scoreboard`, { credentials: 'include' }),
        fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'}/api/sports/${league}/standings`, { credentials: 'include' })
      ]);

      if (scoreRes.ok) setScoreboard(await scoreRes.json());
      if (standRes.ok) setStandings(await standRes.json());
    } catch (err) {
      console.error('Failed to fetch sports data', err);
    } finally {
      setLoading(false);
    }
  };

  // Group standings by their conference/division
  const groupedStandings = standings.reduce((acc, team) => {
    if (!acc[team.group]) acc[team.group] = [];
    acc[team.group].push(team);
    return acc;
  }, {});

  // Sort each group descending by win percent
  Object.keys(groupedStandings).forEach(group => {
    groupedStandings[group].sort((a, b) => {
      const aPct = parseFloat(a.winPercent) || 0;
      const bPct = parseFloat(b.winPercent) || 0;
      return bPct - aPct;
    });
  });

  return (
    <div className="page-container scores-container">
      <div className="league-tabs">
        {LEAGUES.map(league => (
          <button
            key={league.id}
            className={`league-tab-btn ${activeLeague === league.id ? 'active' : ''}`}
            onClick={() => setActiveLeague(league.id)}
          >
            {league.name}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="scores-grid" style={{ marginTop: '2rem' }}>
          {[1, 2, 3, 4, 5, 6].map(n => (
            <div key={n} className="skeleton" style={{ height: '120px', borderRadius: '12px' }}></div>
          ))}
        </div>
      ) : (
        <>
          <section>
            <h2 className="section-title">Scoreboard</h2>
            {scoreboard.length === 0 ? (
              <p>No games scheduled right now.</p>
            ) : (
              <div className="scores-grid">
                {scoreboard.map(game => (
                  <Link href={`/game/${activeLeague}/${game.id}`} key={game.id} style={{ textDecoration: 'none' }}>
                    <div className="scorecard" style={{ transition: 'transform 0.2s', cursor: 'pointer' }} onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-4px)'} onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}>
                      <div className="scorecard-header">
                      <span>{new Date(game.date).toLocaleDateString()}</span>
                      <span className={`scorecard-status ${game.isLive ? 'live' : ''}`}>
                        {game.status}
                      </span>
                    </div>
                    
                    <div className="scorecard-team">
                      <div className="scorecard-team-info">
                        <img src={game.awayTeam.logo} alt="" className="scorecard-logo" />
                        <span className="scorecard-name">{game.awayTeam.name}</span>
                      </div>
                      <span className={`scorecard-score ${game.awayTeam.winner ? 'winner' : 'loser'}`}>
                        {game.awayTeam.score}
                      </span>
                    </div>

                    <div className="scorecard-team">
                      <div className="scorecard-team-info">
                        <img src={game.homeTeam.logo} alt="" className="scorecard-logo" />
                        <span className="scorecard-name">{game.homeTeam.name}</span>
                      </div>
                      <span className={`scorecard-score ${game.homeTeam.winner ? 'winner' : 'loser'}`}>
                        {game.homeTeam.score}
                      </span>
                    </div>
                  </div>
                  </Link>
                ))}
              </div>
            )}
          </section>

          <section style={{ marginTop: '2rem' }}>
            <h2 className="section-title">Standings</h2>
            {Object.keys(groupedStandings).length === 0 ? (
              <p>No standings available.</p>
            ) : (
              Object.entries(groupedStandings).map(([groupName, teams]) => (
                <div key={groupName} style={{ marginBottom: '2rem' }}>
                  <h3 style={{ marginBottom: '1rem', color: 'var(--text-secondary)' }}>{groupName}</h3>
                  <div className="standings-table-container">
                    <table className="standings-table">
                      <thead>
                        <tr>
                          <th>Team</th>
                          <th>W</th>
                          <th>L</th>
                          <th>PCT</th>
                          <th>GB</th>
                          <th>HOME</th>
                          <th>AWAY</th>
                          <th>STRK</th>
                        </tr>
                      </thead>
                      <tbody>
                        {teams.map(team => (
                          <tr key={team.id}>
                            <td>
                              <div className="standings-team-cell">
                                {team.logo && <img src={team.logo} alt="" className="standings-logo" />}
                                {team.name}
                              </div>
                            </td>
                            <td>{team.wins}</td>
                            <td>{team.losses}</td>
                            <td>{team.winPercent}</td>
                            <td>{team.gamesBehind}</td>
                            <td>{team.homeRecord}</td>
                            <td>{team.awayRecord}</td>
                            <td>{team.streak}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))
            )}
          </section>
        </>
      )}
    </div>
  );
}
