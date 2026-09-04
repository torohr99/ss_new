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

  const [tradeRecipient, setTradeRecipient] = useState('');
  const [offeredPlayers, setOfferedPlayers] = useState([]);
  const [requestedPlayers, setRequestedPlayers] = useState([]);
  const [waiverClaims, setWaiverClaims] = useState([]);
  const [editingTeamName, setEditingTeamName] = useState(false);

  const [teamNameDraft, setTeamNameDraft] = useState('');

  const [savingTeamName, setSavingTeamName] = useState(false);

  const fetchWaiverClaims = async () => {
    try {
      const res = await axios.get(
        `${API}/api/fantasy/league/${id}/waivers`,
        {
          withCredentials: true
        }
      );
  
      setWaiverClaims(res.data || []);
    } catch (err) {
      console.error(
        'Failed to load waiver claims:',
        err
      );
    }
  };

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
    try {
      const res = await axios.get(
        `${API}/api/fantasy/league/${id}/week/${week}`,
        {
          withCredentials: true
        }
      );
  
      setMatchups(res.data?.matchups || []);
    } catch (err) {
      console.error(
        'Failed to load matchups:',
        err
      );
  
      setMatchups([]);
    }
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

    if (activeTab === 'waivers') {
      fetchWaiverClaims();
    }
  }, [activeTab, week]);

  if (loading) {
    return (
      <div className="page-container fantasy-page">
        Loading fantasy league...
      </div>
    );
  }

  if (!league || !currentUser) {
    return (
      <div className="page-container fantasy-page">
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
      <div className="page-container fantasy-page">
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

  const saveTeamName = async () => {
    const name = teamNameDraft.trim();
  
    if (
      name.length < 2 ||
      name.length > 40
    ) {
      alert(
        'Team name must be between 2 and 40 characters.'
      );
      return;
    }
  
    setSavingTeamName(true);
  
    try {
      await axios.patch(
        `${API}/api/fantasy/team/${myTeam.id}/name`,
        { name },
        {
          withCredentials: true
        }
      );
  
      await fetchLeague();
  
      setEditingTeamName(false);
    } catch (err) {
      alert(
        err.response?.data?.error ||
        'Unable to update team name.'
      );
    } finally {
      setSavingTeamName(false);
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

  const proposeTrade = async () => {
    if (!tradeRecipient) {
      alert('Select a team.');
      return;
    }
  
    if (
      offeredPlayers.length === 0 &&
      requestedPlayers.length === 0
    ) {
      alert('Select at least one player.');
      return;
    }
  
    try {
      await axios.post(
        `${API}/api/fantasy/league/${id}/trades`,
        {
          recipientTeamId: Number(tradeRecipient),
          offeredPlayerIds: offeredPlayers,
          requestedPlayerIds: requestedPlayers
        },
        {
          withCredentials: true
        }
      );
  
      alert('Trade proposal sent.');
  
      setTradeRecipient('');
      setOfferedPlayers([]);
      setRequestedPlayers([]);
  
      await fetchTrades();
    } catch (err) {
      alert(
        err.response?.data?.error ||
        'Failed to propose trade.'
      );
    }
  };
  
  const tabs = [
    ['team', 'My Team'],
    ['matchup', 'Matchup'],
    ['standings', 'Standings'],
    ['players', 'Players'],
    ['transactions', 'Transactions'],
    ['trades', 'Trades'],
    ['waivers', 'Waivers']
  ];

  return (
    <div className="page-container fantasy-page">

      <div className="fantasy-hero">
        <div className="fantasy-eyebrow">
          SportSmack Fantasy Football
        </div>
      
        <h1>{league.name}</h1>
      
        <div className="fantasy-hero-subtitle">
          {myTeam.name}
        </div>
      
        <div className="fantasy-action-row">
          {(league.status === 'PREDRAFT' ||
            league.status === 'DRAFTING') && (
            <button
              className="fantasy-button fantasy-button-primary"
              onClick={() =>
                router.push(
                  `/fantasy/draft/${league.id}`
                )
              }
            >
              🏈 Enter Draft Room
            </button>
          )}
      
          <button
            className="fantasy-button fantasy-button-secondary"
            onClick={() =>
              router.push('/fantasy')
            }
          >
            ← All Leagues
          </button>
        </div>
      
      </div>

      <div className="fantasy-tabs">
        {tabs.map(([key, label]) => (
          <button
            key={key}
            className={`fantasy-tab ${
              activeTab === key
                ? 'active'
                : ''
            }`}
            onClick={() =>
              setActiveTab(key)
            }
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'team' && (
        <div className="fantasy-team-layout">
      
          <div className="fantasy-card fantasy-section">
      
            <div className="fantasy-section-title">
              <div>
                <h2>My Roster</h2>
                <span>
                  {myPlayers.length}/15 players
                </span>
              </div>
      
              <span className="fantasy-status">
                {starters.length} Starters
              </span>
            </div>
      
            <div style={{ marginBottom: '1.5rem' }}>
              <div className="fantasy-roster-label">
                Starting Lineup
              </div>
      
              {starters.length === 0 ? (
                <div
                  style={{
                    padding: '2rem',
                    textAlign: 'center',
                    color: 'var(--text-secondary)',
                    border:
                      '1px dashed rgba(255,255,255,0.1)',
                    borderRadius: '14px'
                  }}
                >
                  No starters configured yet.
                </div>
              ) : (
                <div className="fantasy-roster-grid">
                  {starters.map(tp => (
                    <FantasyPlayerCard
                      key={tp.id}
                      tp={tp}
                      status="STARTER"
                      action={
                        <button
                          className="fantasy-button fantasy-button-secondary"
                          onClick={() =>
                            setRosterStatus(
                              tp.id,
                              'BENCH'
                            )
                          }
                        >
                          Move to Bench
                        </button>
                      }
                    />
                  ))}
                </div>
              )}
            </div>
      
            <div>
              <div className="fantasy-roster-label bench">
                Bench
              </div>
      
              {bench.length === 0 ? (
                <div
                  style={{
                    padding: '2rem',
                    textAlign: 'center',
                    color: 'var(--text-secondary)',
                    border:
                      '1px dashed rgba(255,255,255,0.1)',
                    borderRadius: '14px'
                  }}
                >
                  No bench players yet.
                </div>
              ) : (
                <div className="fantasy-roster-grid">
                  {bench.map(tp => (
                    <FantasyPlayerCard
                      key={tp.id}
                      tp={tp}
                      status="BENCH"
                      action={
                        <button
                          className="fantasy-button fantasy-button-primary"
                          onClick={() =>
                            setRosterStatus(
                              tp.id,
                              'STARTER'
                            )
                          }
                        >
                          Start Player
                        </button>
                      }
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
      
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '1.5rem'
            }}
          >
      
            <div className="fantasy-card fantasy-section">
              {!editingTeamName ? (
                <div className="fantasy-section-title fantasy-team-name-header">
                  <div>
                    <h2>{myTeam.name}</h2>
                    <span>Fantasy Team</span>
                  </div>
            
                  <button
                    className="fantasy-button fantasy-button-secondary"
                    onClick={() => {
                      setTeamNameDraft(myTeam.name);
                      setEditingTeamName(true);
                    }}
                  >
                    ✎ Edit
                  </button>
                </div>
              ) : (
                <div className="fantasy-team-name-editing">
                  <div>
                    <div className="fantasy-roster-label">
                      Team Name
                    </div>
            
                    <input
                      className="fantasy-team-name-input"
                      value={teamNameDraft}
                      maxLength={40}
                      onChange={e =>
                        setTeamNameDraft(e.target.value)
                      }
                      autoFocus
                    />
                  </div>
            
                  <div className="fantasy-team-name-actions">
                    <button
                      className="fantasy-button fantasy-button-primary"
                      onClick={saveTeamName}
                      disabled={savingTeamName}
                    >
                      {savingTeamName ? 'Saving...' : 'Save'}
                    </button>
            
                    <button
                      className="fantasy-button fantasy-button-secondary"
                      onClick={() => setEditingTeamName(false)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
      
            <div className="fantasy-card fantasy-section">
              <div className="fantasy-section-title">
                <h2>Team Summary</h2>
              </div>
      
              <div className="fantasy-stat-grid">
      
                <div className="fantasy-stat">
                  <div className="fantasy-stat-label">
                    Points
                  </div>
                  <div className="fantasy-stat-value">
                    {totalPoints.toFixed(1)}
                  </div>
                </div>
      
                <div className="fantasy-stat">
                  <div className="fantasy-stat-label">
                    Roster
                  </div>
                  <div className="fantasy-stat-value">
                    {myPlayers.length}/15
                  </div>
                </div>
      
                <div className="fantasy-stat">
                  <div className="fantasy-stat-label">
                    Starters
                  </div>
                  <div className="fantasy-stat-value">
                    {starters.length}
                  </div>
                </div>
      
                <div className="fantasy-stat">
                  <div className="fantasy-stat-label">
                    FAAB
                  </div>
                  <div className="fantasy-stat-value">
                    {myTeam.faab ?? 100}
                  </div>
                </div>
      
              </div>
            </div>
      
          </div>
        </div>
      )}

      {activeTab === 'players' && (
        <div className="fantasy-card fantasy-section">

          <h2 className="section-title">
            Free Agents
          </h2>

          <div style={{
            display: 'flex',
            gap: '0.75rem',
            marginBottom: '1rem'
          }}>
            <input
              className="fantasy-search"
              placeholder="Search players..."
              value={search}
              onChange={e =>
                setSearch(e.target.value)
              }
            />

            <select
              className="fantasy-search"
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
                className="fantasy-button fantasy-button-primary"
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
        <div className="fantasy-card fantasy-section fantasy-standings-card">
          <div className="fantasy-section-title">
            <div>
              <h2>Standings</h2>
              <span>League record and total fantasy points</span>
            </div>
          </div>
      
          <div className="fantasy-standings-header">
            <span>#</span>
            <span>Team</span>
            <span>W</span>
            <span>L</span>
            <span>T</span>
            <span>Points</span>
          </div>
      
          {[...(league.teams || [])]
            .map(team => {
              const teamMatchups = [
                ...(team.homeMatchups || []),
                ...(team.awayMatchups || [])
              ];
      
              let wins = 0;
              let losses = 0;
              let ties = 0;
      
              for (const matchup of teamMatchups) {
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
                className="fantasy-standings-row"
              >
                <span className="fantasy-rank">
                  {index + 1}
                </span>
      
                <span className="fantasy-team-cell">
                  {team.name}
                </span>
      
                <span className="fantasy-record">
                  {team.wins}
                </span>
      
                <span className="fantasy-record">
                  {team.losses}
                </span>
      
                <span className="fantasy-record">
                  {team.ties}
                </span>
      
                <span className="fantasy-points">
                  {team.totalPoints.toFixed(1)}
                </span>
              </div>
            ))}
        </div>
      )}

      {activeTab === 'matchup' && (
        <div className="fantasy-card fantasy-section">
          <div className="fantasy-section-title">
            <div>
              <h2>Week {week} Matchups</h2>
              <span>League schedule and scores</span>
            </div>
      
            <select
              className="fantasy-search"
              value={week}
              onChange={e =>
                setWeek(Number(e.target.value))
              }
              style={{
                width: 'auto',
                minWidth: '120px'
              }}
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
            <div
              style={{
                padding: '3rem 1rem',
                textAlign: 'center',
                color: 'var(--text-secondary)'
              }}
            >
              Matchups have not been generated yet.
            </div>
          ) : (
            matchups.map(matchup => (
              <div
                key={matchup.id}
                className="fantasy-matchup-card"
              >
                <div className="fantasy-matchup-teams">
                  <div className="fantasy-matchup-team">
                    <div className="fantasy-matchup-team-name">
                      {matchup.homeTeam.name}
                    </div>
      
                    <div className="fantasy-matchup-score">
                      {matchup.homeScore ?? 0}
                    </div>
                  </div>
      
                  <div className="fantasy-vs">
                    VS
                  </div>
      
                  <div className="fantasy-matchup-team">
                    <div className="fantasy-matchup-team-name">
                      {matchup.awayTeam.name}
                    </div>
      
                    <div className="fantasy-matchup-score">
                      {matchup.awayScore ?? 0}
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === 'transactions' && (
        <div className="fantasy-card fantasy-section">
          <div className="fantasy-section-title">
            <div>
              <h2>Transactions</h2>
              <span>Recent roster activity</span>
            </div>
          </div>
      
          {transactions.length === 0 ? (
            <div
              style={{
                padding: '3rem 1rem',
                textAlign: 'center',
                color: 'var(--text-secondary)'
              }}
            >
              No transactions yet.
            </div>
          ) : (
            transactions.map(tx => (
              <div
                key={tx.id}
                className="fantasy-transaction-row"
              >
                <div>
                  <span className="fantasy-transaction-type">
                    {tx.type}
                  </span>
      
                  <div
                    style={{
                      marginTop: '0.5rem',
                      fontWeight: 700
                    }}
                  >
                    {tx.player?.name ||
                      'Unknown player'}
                  </div>
      
                  <div
                    style={{
                      marginTop: '0.2rem',
                      color: 'var(--text-secondary)',
                      fontSize: '0.8rem'
                    }}
                  >
                    {tx.team?.name}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === 'trades' && (
        <div className="space-y-6">
      
          <h2 className="text-xl font-bold">
            Trades
          </h2>

          <div className="fantasy-trade-card">
            <h3 className="font-semibold">
              Propose a Trade
            </h3>
          
            <select
              className="auth-input"
              value={tradeRecipient}
              onChange={e =>
                setTradeRecipient(e.target.value)
              }
            >
              <option value="">
                Select another team
              </option>
          
              {(league.teams || [])
                .filter(team => team.id !== myTeam.id)
                .map(team => (
                  <option
                    key={team.id}
                    value={team.id}
                  >
                    {team.name}
                  </option>
                ))}
            </select>
          
            <div>
              <strong>
                Players You Give
              </strong>
          
              {myPlayers.map(tp => (
                <label
                  key={tp.id}
                  style={{
                    display: 'block',
                    marginTop: '0.5rem'
                  }}
                >
                  <input
                    type="checkbox"
                    checked={offeredPlayers.includes(
                      tp.player.id
                    )}
                    onChange={e => {
                      setOfferedPlayers(prev =>
                        e.target.checked
                          ? [...prev, tp.player.id]
                          : prev.filter(
                              id => id !== tp.player.id
                            )
                      );
                    }}
                  />{' '}
                  {tp.player.name} ({tp.player.position})
                </label>
              ))}
            </div>
          
            {tradeRecipient && (
              <div>
                <strong>
                  Players You Want
                </strong>
          
                {(
                  league.teams.find(
                    team =>
                      team.id === Number(tradeRecipient)
                  )?.players || []
                ).map(tp => (
                  <label
                    key={tp.id}
                    style={{
                      display: 'block',
                      marginTop: '0.5rem'
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={requestedPlayers.includes(
                        tp.player.id
                      )}
                      onChange={e => {
                        setRequestedPlayers(prev =>
                          e.target.checked
                            ? [...prev, tp.player.id]
                            : prev.filter(
                                id => id !== tp.player.id
                              )
                        );
                      }}
                    />{' '}
                    {tp.player.name} ({tp.player.position})
                  </label>
                ))}
              </div>
            )}
          
            <button
              className="fantasy-button fantasy-button-primary"
              onClick={proposeTrade}
            >
              Send Trade Proposal
            </button>
          </div>
      
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
                    trade.recipientTeam?.id === myTeam.id && (
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
                          className="fantasy-button fantasy-button-secondary"
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
                          className="fantasy-button fantasy-button-secondary"
                        >
                          Reject
                        </button>
                        {trade.status === 'PENDING' &&
                          trade.proposerTeam?.id === myTeam.id && (
                            <button
                              onClick={async () => {
                                try {
                                  await axios.post(
                                    `${API}/api/fantasy/trades/${trade.id}/cancel`,
                                    {},
                                    {
                                      withCredentials: true
                                    }
                                  );
                        
                                  await fetchTrades();
                                } catch (err) {
                                  alert(
                                    err.response?.data?.error ||
                                    'Failed to cancel trade.'
                                  );
                                }
                              }}
                              className="fantasy-button fantasy-button-secondary"
                            >
                              Cancel
                            </button>
                          )}
                      </div>
                    )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'waivers' && (
        <div className="fantasy-card fantasy-section">
          <h2 className="section-title">
            Pending Waiver Claims
          </h2>
      
          {waiverClaims.length === 0 ? (
            <p>No pending waiver claims.</p>
          ) : (
            waiverClaims.map(claim => (
              <div
                key={claim.id}
                className="fantasy-waiver-row"
              >
                <div className="fantasy-waiver-player">
                  {claim.player?.name}
                </div>
              
                <div className="fantasy-waiver-meta">
                  {claim.team?.name}
                </div>
              
                <div className="fantasy-waiver-meta">
                  Bid: {claim.bidAmount} FAAB
                </div>
              </div>
            ))
          )}
        </div>
      )}

    </div>
  );
}

function FantasyPlayerCard({
  tp,
  status,
  action
}) {
  const player = tp.player;

  return (
    <div className="fantasy-player-card">

      {player.imageUrl ? (
        <img
          src={player.imageUrl}
          alt={player.name}
          className="fantasy-player-image"
          loading="lazy"
        />
      ) : (
        <div
          className="fantasy-player-image"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '2.5rem',
            fontWeight: 900,
            color: '#fff',
            background:
              'linear-gradient(135deg, #27272a, #09090b)'
          }}
        >
          {player.name
            .split(' ')
            .map(word => word[0])
            .join('')
            .slice(0, 2)
            .toUpperCase()}
        </div>
      )}

      <div className="fantasy-player-info">

        <div
          className="fantasy-player-name"
        >
          {player.name}
        </div>

        <div className="fantasy-player-meta">
          <span>
            {player.position} • {player.team}
          </span>

          <span>
            #{player.jerseyNumber || '—'}
          </span>
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '0.5rem',
            marginTop: '0.75rem'
          }}
        >
          <span
            style={{
              fontSize: '0.75rem',
              color: 'var(--text-secondary)'
            }}
          >
            {player.projectedPoints != null
              ? `${Number(
                  player.projectedPoints
                ).toFixed(1)} projected`
              : 'Projection unavailable'}
          </span>

          <span
            className="fantasy-player-badge"
          >
            {status}
          </span>
        </div>

        <div style={{ marginTop: '0.75rem' }}>
          {action}
        </div>

      </div>
    </div>
  );
}
