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

  const fetchLeague = async () => {
    const res = await axios.get(
      `${API}/api/fantasy/league/${id}`,
      { withCredentials: true }
    );

    setLeague(res.data);
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
      `${API}/api/fantasy/league/${id}/matchups/1`,
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
  }, [activeTab]);

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
    ['transactions', 'Transactions']
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
                onClick={() =>
                  addPlayer(player.id)
                }
              >
                Add
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

          {[...league.teams]
            .sort((a, b) => {
              const aPts =
                a.weeklyScores?.reduce(
                  (s, x) =>
                    s +
                    Number(
                      x.points || 0
                    ),
                  0
                ) || 0;

              const bPts =
                b.weeklyScores?.reduce(
                  (s, x) =>
                    s +
                    Number(
                      x.points || 0
                    ),
                  0
                ) || 0;

              return bPts - aPts;
            })
            .map((team, index) => (
              <div
                key={team.id}
                style={{
                  display: 'flex',
                  justifyContent:
                    'space-between',
                  padding: '1rem',
                  borderBottom:
                    '1px solid var(--border)'
                }}
              >
                <strong>
                  #{index + 1}{' '}
                  {team.name}
                </strong>

                <span>
                  {(
                    team.weeklyScores
                      ?.reduce(
                        (s, x) =>
                          s +
                          Number(
                            x.points || 0
                          ),
                        0
                      ) || 0
                  ).toFixed(1)} pts
                </span>
              </div>
            ))}
        </div>
      )}

      {activeTab === 'matchup' && (
        <div className="profile-section">
          <h2 className="section-title">
            Week 1 Matchups
          </h2>

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
