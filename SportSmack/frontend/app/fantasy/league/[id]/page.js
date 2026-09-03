'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';

const API =
  process.env.NEXT_PUBLIC_API_URL ||
  'http://localhost:5000';

const POSITIONS = [
  'ALL',
  'QB',
  'RB',
  'WR',
  'TE',
  'K',
  'DST'
];

export default function LeaguePage({ params }) {
  const { id } = params;
  const router = useRouter();
  const [week, setWeek] = useState(1);

  const [league, setLeague] = useState(null);
  const [currentUser, setCurrentUser] =
    useState(null);

  const [activeTab, setActiveTab] =
    useState('team');

  const [freeAgents, setFreeAgents] =
    useState([]);

  const [transactions, setTransactions] =
    useState([]);

  const [matchups, setMatchups] =
    useState([]);

  const [search, setSearch] =
    useState('');

  const [position, setPosition] =
    useState('ALL');

  const [loading, setLoading] =
    useState(true);

  const [trades, setTrades] = useState([]);

  const fetchLeague = async () => {
    const res = await axios.get(
      `${API}/api/fantasy/league/${id}`,
      { withCredentials: true }
    );

    setLeague(res.data);
  };

  const fetchTrades = async () => {
    try {
      const response = await axios.get(
        `${API}/api/fantasy/league/${id}/trades`,
        {
          withCredentials: true
        }
      );
  
      setTrades(response.data || []);
    } catch (err) {
      console.error('Failed to load trades:', err);
    }
  };

  const fetchUser = async () => {
    const res = await axios.get(
      `${API}/api/auth/me`,
      { withCredentials: true }
    );

    setCurrentUser(res.data);
  };

  const fetchFreeAgents = async () => {
    const res = await axios.get(
      `${API}/api/fantasy/league/${id}/free-agents`,
      { withCredentials: true }
    );

    setFreeAgents(res.data);
  };

  const fetchTransactions = async () => {
    const res = await axios.get(
      `${API}/api/fantasy/league/${id}/transactions`,
      { withCredentials: true }
    );

    setTransactions(res.data);
  };

  const fetchMatchups = async () => {
    const res = await axios.get(
      `${API}/api/fantasy/league/${id}/matchups/${week}`,
      { withCredentials: true }
    );
  
    setMatchups(res.data);
  };

  useEffect(() => {
    async function load() {
      try {
        await Promise.all([
          fetchLeague(),
          fetchUser()
        ]);
      } catch (err) {
        if (err.response?.status === 401) {
          router.push('/login');
        }
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [id]);

  useEffect(() => {
    if (activeTab === 'players') {
      fetchFreeAgents();
    }

    if (activeTab === 'transactions') {
      fetchTransactions();
    }

    if (activeTab === 'matchup') {
      fetchMatchups();
    }

    if (activeTab === 'trades') {
      fetchTrades();
    }
  }, [activeTab, week]);

  if (loading) {
    return (
      <div className="page-container">
        Loading fantasy league...
      </div>
    );
  }

  if (!league || !currentUser) {
    return (
      <div className="page-container">
        League not found.
      </div>
    );
  }

  const myTeam =
    league.teams.find(
      team =>
        team.userId === currentUser.id
    );

  if (!myTeam) {
    return (
      <div className="page-container">
        You are not a member of this league.
      </div>
    );
  }

  const myPlayers =
    myTeam.players || [];

  const starters =
    myPlayers.filter(
      p => p.status === 'STARTER'
    );

  const bench =
    myPlayers.filter(
      p => p.status === 'BENCH'
    );

  const totalPoints =
    myTeam.weeklyScores?.reduce(
      (sum, score) =>
        sum + Number(score.points || 0),
      0
    ) || 0;

  const filteredPlayers =
    freeAgents.filter(player => {
      const matchesSearch =
        player.name
          .toLowerCase()
          .includes(
            search.toLowerCase()
          );

      const matchesPosition =
        position === 'ALL' ||
        player.position === position;

      return (
        matchesSearch &&
        matchesPosition
      );
    });

  const setRosterStatus = async (
    teamPlayerId,
    status
  ) => {
    try {
      await axios.post(
        `${API}/api/fantasy/team/${myTeam.id}/roster`,
        {
          teamPlayerId,
          status
        },
        {
          withCredentials: true
        }
      );

      await fetchLeague();
    } catch (err) {
      alert(
        err.response?.data?.error ||
        'Unable to update roster'
      );
    }
  };

  const addPlayer = async playerId => {
    try {
      await axios.post(
        `${API}/api/fantasy/team/${myTeam.id}/add-player`,
        { playerId },
        { withCredentials: true }
      );

      await fetchLeague();
      await fetchFreeAgents();
    } catch (err) {
      alert(
        err.response?.data?.error ||
        'Unable to add player'
      );
    }
  };

  const submitWaiverClaim = async (
    playerId,
    bidAmount
  ) => {
    try {
      await axios.post(
        `${API}/api/fantasy/league/${id}/waivers/claim`,
        {
          playerId,
          bidAmount
        },
        {
          withCredentials: true
        }
      );
  
      alert('Waiver claim submitted.');
    } catch (err) {
      alert(
        err.response?.data?.error ||
        'Failed to submit waiver claim.'
      );
    }
  };

  const dropPlayer = async playerId => {
    try {
      await axios.post(
        `${API}/api/fantasy/team/${myTeam.id}/drop-player`,
        { playerId },
        { withCredentials: true }
      );

      await fetchLeague();
      await fetchFreeAgents();
    } catch (err) {
      alert(
        err.response?.data?.error ||
        'Unable to drop player'
      );
    }
  };

  const tabs = [
    ['team', 'My Team'],
    ['matchup', 'Matchup'],
    ['standings', 'Standings'],
    ['players', 'Players'],
    ['transactions', 'Transactions'],
    ['trades', 'Trades']
  ];

  return (
    <div className="page-container">

      <div className="feed-header">
        <div>
          <h1>{league.name}</h1>
          <p style={{
            color: 'var(--text-secondary)'
          }}>
            {myTeam.name}
          </p>
        </div>

        {(league.status === 'PREDRAFT' ||
          league.status === 'DRAFTING') && (
          <button
            className="btn-primary"
            onClick={() =>
              router.push(
                `/fantasy/draft/${league.id}`
              )
            }
          >
            Draft Room
          </button>
        )}
      </div>

      <div style={{
        display: 'flex',
        gap: '0.5rem',
        overflowX: 'auto',
        marginBottom: '1.5rem'
      }}>
        {tabs.map(([key, label]) => (
          <button
            key={key}
            className={
              activeTab === key
                ? 'btn-primary'
                : 'btn-secondary'
            }
            onClick={() =>
              setActiveTab(key)
            }
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'team' && (
        <div style={{
          display: 'grid',
          gridTemplateColumns:
            '2fr 1fr',
          gap: '1.5rem'
        }}>

          <div className="profile-section">
            <h2 className="section-title">
              Starting Lineup
            </h2>

            {starters.length === 0 && (
              <p>
                Set your starting lineup.
              </p>
            )}

            {starters.map(tp => (
              <PlayerRow
                key={tp.id}
                tp={tp}
                action={
                  <button
                    className="btn-secondary"
                    onClick={() =>
                      setRosterStatus(
                        tp.id,
                        'BENCH'
                      )
                    }
                  >
                    Bench
                  </button>
                }
              />
            ))}

            <h2
              className="section-title"
              style={{
                marginTop: '2rem'
              }}
            >
              Bench
            </h2>

            {bench.map(tp => (
              <PlayerRow
                key={tp.id}
                tp={tp}
                action={
                  <button
                    className="btn-primary"
                    onClick={() =>
                      setRosterStatus(
                        tp.id,
                        'STARTER'
                      )
                    }
                  >
                    Start
                  </button>
                }
              />
            ))}
          </div>

          <div className="profile-section">
            <h2 className="section-title">
              Team Summary
            </h2>

            <div style={{
              fontSize: '2rem',
              fontWeight: 'bold'
            }}>
              {totalPoints.toFixed(1)}
            </div>

            <div style={{
              color: 'var(--text-secondary)'
            }}>
              Total fantasy points
            </div>

            <div style={{
              marginTop: '1.5rem'
            }}>
              Roster: {myPlayers.length}/15
            </div>

            <div>
              Starters: {starters.length}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'players' && (
        <div className="profile-section">

          <h2 className="section-title">
            Free Agents
          </h2>

          <div style={{
            display: 'flex',
            gap: '0.75rem',
            marginBottom: '1rem'
          }}>
            <input
              className="auth-input"
              placeholder="Search players..."
              value={search}
              onChange={e =>
                setSearch(e.target.value)
              }
            />

            <select
              className="auth-input"
              value={position}
              onChange={e =>
                setPosition(e.target.value)
              }
            >
              {POSITIONS.map(pos => (
                <option
                  key={pos}
                  value={pos}
                >
                  {pos}
                </option>
              ))}
            </select>
          </div>

          {filteredPlayers.map(player => (
            <div
              key={player.id}
              style={{
                display: 'flex',
                justifyContent:
                  'space-between',
                alignItems: 'center',
                padding: '1rem',
                borderBottom:
                  '1px solid var(--border)'
              }}
            >
              <div>
                <strong>
                  {player.name}
                </strong>

                <div style={{
                  color:
                    'var(--text-secondary)'
                }}>
                  {player.position} •{' '}
                  {player.team}
                </div>
              </div>

              <button
                className="btn-primary"
                onClick={() => {
                  const bid = window.prompt(
                    `FAAB bid for ${player.name}:`,
                    '0'
                  );
              
                  if (bid === null) return;
              
                  submitWaiverClaim(
                    player.id,
                    Number(bid)
                  );
                }}
              >
                Waiver Claim
              </button>
            </div>
          ))}

        </div>
      )}

      {activeTab === 'standings' && (
        <div className="profile-section">
          <h2 className="section-title">
            Standings
          </h2>
      
          {[...(league.teams || [])]
            .map(team => {
              const matchups = [
                ...(team.homeMatchups || []),
                ...(team.awayMatchups || [])
              ];
      
              let wins = 0;
              let losses = 0;
              let ties = 0;
      
              for (const matchup of matchups) {
                if (matchup.status !== 'FINAL') continue;
      
                const isHome =
                  matchup.homeTeamId === team.id;
      
                const teamScore = isHome
                  ? matchup.homeScore
                  : matchup.awayScore;
      
                const opponentScore = isHome
                  ? matchup.awayScore
                  : matchup.homeScore;
      
                if (teamScore > opponentScore) {
                  wins++;
                } else if (teamScore < opponentScore) {
                  losses++;
                } else {
                  ties++;
                }
              }
      
              const totalPoints =
                (team.weeklyScores || []).reduce(
                  (sum, score) =>
                    sum + Number(score.points || 0),
                  0
                );
      
              return {
                ...team,
                wins,
                losses,
                ties,
                totalPoints
              };
            })
            .sort((a, b) => {
              if (b.wins !== a.wins) {
                return b.wins - a.wins;
              }
      
              if (b.ties !== a.ties) {
                return b.ties - a.ties;
              }
      
              return b.totalPoints - a.totalPoints;
            })
            .map((team, index) => (
              <div
                key={team.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns:
                    '50px 1fr repeat(3, 70px) 100px',
                  gap: '1rem',
                  alignItems: 'center',
                  padding: '1rem',
                  borderBottom:
                    '1px solid var(--border)'
                }}
              >
                <strong>{index + 1}</strong>
      
                <strong>{team.name}</strong>
      
                <span>{team.wins}</span>
                <span>{team.losses}</span>
                <span>{team.ties}</span>
      
                <span>
                  {team.totalPoints.toFixed(1)}
                </span>
              </div>
            ))}
        </div>
      )}

      {activeTab === 'matchup' && (
        <div className="profile-section">
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '1rem'
          }}>
            <h2 className="section-title">
              Week {week} Matchups
            </h2>
          
            <select
              className="auth-input"
              value={week}
              onChange={e =>
                setWeek(Number(e.target.value))
              }
            >
              {Array.from(
                { length: 18 },
                (_, i) => i + 1
              ).map(w => (
                <option key={w} value={w}>
                  Week {w}
                </option>
              ))}
            </select>
          </div>

          {matchups.length === 0 ? (
            <p>
              Matchups have not been generated yet.
            </p>
          ) : (
            matchups.map(matchup => (
              <div
                key={matchup.id}
                style={{
                  padding: '1rem',
                  marginBottom: '1rem',
                  border:
                    '1px solid var(--border)',
                  borderRadius: '10px'
                }}
              >
                <strong>
                  {matchup.homeTeam.name}
                </strong>

                {' '}vs{' '}

                <strong>
                  {matchup.awayTeam.name}
                </strong>

                <div style={{
                  marginTop: '0.5rem',
                  color:
                    'var(--text-secondary)'
                }}>
                  {matchup.homeScore} -{' '}
                  {matchup.awayScore}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === 'transactions' && (
        <div className="profile-section">

          <h2 className="section-title">
            Transactions
          </h2>

          {transactions.map(tx => (
            <div
              key={tx.id}
              style={{
                padding: '0.8rem',
                borderBottom:
                  '1px solid var(--border)'
              }}
            >
              <strong>
                {tx.type}
              </strong>{' '}

              {tx.player?.name ||
                'Unknown player'}

              <div style={{
                fontSize: '0.8rem',
                color:
                  'var(--text-secondary)'
              }}>
                {tx.team?.name}
              </div>
            </div>
          ))}

        </div>
      )}

      {activeTab === 'trades' && (
        <div className="space-y-6">
      
          <h2 className="text-xl font-bold">
            Trades
          </h2>
      
          {trades.length === 0 ? (
            <div className="rounded-lg border p-6">
              <p>No trades yet.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {trades.map(trade => (
                <div
                  key={trade.id}
                  className="rounded-lg border p-4"
                >
                  <div className="flex justify-between items-center mb-3">
                    <div>
                      <strong>
                        {trade.proposerTeam?.name}
                      </strong>
      
                      <span className="mx-2">
                        →
                      </span>
      
                      <strong>
                        {trade.recipientTeam?.name}
                      </strong>
                    </div>
      
                    <span className="font-semibold">
                      {trade.status}
                    </span>
                  </div>
      
                  <div className="space-y-2">
                    {trade.items?.map(item => (
                      <div
                        key={item.id}
                        className="flex justify-between"
                      >
                        <span>
                          {item.player?.name}
                        </span>
      
                        <span className="text-sm">
                          {item.fromTeamId ===
                          trade.proposerTeamId
                            ? '→ Receiving team'
                            : '→ Proposing team'}
                        </span>
                      </div>
                    ))}
                  </div>
      
                  {trade.status === 'PENDING' &&
                    trade.recipientTeam?.userId ===
                      league?.teams?.find(
                        t => t.userId === currentUser?.id
                      )?.userId && (
                      <div className="flex gap-2 mt-4">
                        <button
                          onClick={async () => {
                            await axios.post(
                              `${API}/api/fantasy/trades/${trade.id}/accept`,
                              {},
                              {
                                withCredentials: true
                              }
                            );
      
                            await fetchTrades();
                            await fetchLeague();
                          }}
                          className="px-4 py-2 rounded"
                        >
                          Accept
                        </button>
      
                        <button
                          onClick={async () => {
                            await axios.post(
                              `${API}/api/fantasy/trades/${trade.id}/reject`,
                              {},
                              {
                                withCredentials: true
                              }
                            );
      
                            await fetchTrades();
                          }}
                          className="px-4 py-2 rounded"
                        >
                          Reject
                        </button>
                      </div>
                    )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}  

    </div>
  );
}

function PlayerRow({ tp, action }) {
  return (
    <div style={{
      display: 'flex',
      justifyContent:
        'space-between',
      alignItems: 'center',
      padding: '0.8rem',
      marginBottom: '0.5rem',
      background:
        'var(--bg-secondary)',
      borderRadius: '8px'
    }}>

      <div>
        <strong>
          {tp.player.name}
        </strong>

        <div style={{
          fontSize: '0.8rem',
          color:
            'var(--text-secondary)'
        }}>
          {tp.player.position} •{' '}
          {tp.player.team}
        </div>
      </div>

      {action}

    </div>
  );
}
