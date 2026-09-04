'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import { io } from 'socket.io-client';

const NFL_COLORS = {
  'ARI': { primary: '#97233F', secondary: '#000000' },
  'ATL': { primary: '#A71930', secondary: '#000000' },
  'BAL': { primary: '#241773', secondary: '#000000' },
  'BUF': { primary: '#00338D', secondary: '#C60C30' },
  'CAR': { primary: '#0085CA', secondary: '#101820' },
  'CHI': { primary: '#0B162A', secondary: '#C83803' },
  'CIN': { primary: '#FB4F14', secondary: '#000000' },
  'CLE': { primary: '#311D00', secondary: '#FF3C00' },
  'DAL': { primary: '#003594', secondary: '#869397' },
  'DEN': { primary: '#FB4F14', secondary: '#002244' },
  'DET': { primary: '#0076B6', secondary: '#B0B7BC' },
  'GB':  { primary: '#203731', secondary: '#FFB612' },
  'HOU': { primary: '#03202F', secondary: '#A71930' },
  'IND': { primary: '#002C5F', secondary: '#A2AAAD' },
  'JAX': { primary: '#006778', secondary: '#D7A22A' },
  'KC':  { primary: '#E31837', secondary: '#FFB81C' },
  'LV':  { primary: '#000000', secondary: '#A5ACAF' },
  'LAC': { primary: '#0080C6', secondary: '#FFC20E' },
  'LAR': { primary: '#003594', secondary: '#FFA300' },
  'MIA': { primary: '#008E97', secondary: '#FC4C02' },
  'MIN': { primary: '#4F2683', secondary: '#FFC62F' },
  'NE':  { primary: '#002244', secondary: '#C60C30' },
  'NO':  { primary: '#D3BC8D', secondary: '#101820' },
  'NYG': { primary: '#0B2265', secondary: '#A71930' },
  'NYJ': { primary: '#125740', secondary: '#000000' },
  'PHI': { primary: '#004C54', secondary: '#A5ACAF' },
  'PIT': { primary: '#FFB612', secondary: '#101820' },
  'SF':  { primary: '#AA0000', secondary: '#B3995D' },
  'SEA': { primary: '#002244', secondary: '#69BE28' },
  'TB':  { primary: '#D50A0A', secondary: '#FF7900' },
  'TEN': { primary: '#0C2340', secondary: '#4B92DB' },
  'WAS': { primary: '#5A1414', secondary: '#FFB612' }
};

export default function DraftRoom({ params }) {
  const { id } = params;
  const router = useRouter();
  const [socket, setSocket] = useState(null);
  
  const [league, setLeague] = useState(null);
  const [teams, setTeams] = useState([]);
  const [picks, setPicks] = useState([]);
  const [availablePlayers, setAvailablePlayers] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [status, setStatus] = useState('LOADING');
  const [currentPickIndex, setCurrentPickIndex] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('players'); // 'players', 'board'

    useEffect(() => {
      const fetchData = async () => {
        try {
          const apiUrl =
            process.env.NEXT_PUBLIC_API_URL ||
            'http://localhost:5000';
  
          const userRes = await axios.get(
            `${apiUrl}/api/auth/me`,
            { withCredentials: true }
          );
  
          setCurrentUser(userRes.data);
  
          const leagueRes = await axios.get(
            `${apiUrl}/api/fantasy/league/${id}`,
            { withCredentials: true }
          );
  
          setLeague(leagueRes.data);
  
                    const playersRes = await axios.get(
                      `${apiUrl}/api/fantasy/players`,
                      {
                        withCredentials: true
                      }
                    );
          
                    const players = Array.isArray(
                      playersRes.data
                    )
                      ? playersRes.data
                      : [];
          
                    console.log(
                      'Fantasy players loaded:',
                      players.length
                    );
          
                    setAvailablePlayers(players);
                } catch (err) {
                  console.error(
                    'Failed to load fantasy draft data:',
                    err.response?.data ||
                      err.message ||
                      err
                  );
          
                  setAvailablePlayers([]);
                }
              };
          
              fetchData();
            }, [id]);

  useEffect(() => {
    const token = localStorage.getItem('smack_token');
    const newSocket = io((process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'), {
      auth: token ? { token } : {},
      transports: ['websocket', 'polling']
    });
    setSocket(newSocket);

    newSocket.on('connect', () => {
      newSocket.emit('join_draft', { leagueId: id });
    });

    newSocket.on('draft_state', (state) => {
      setStatus(state.status);
      setCurrentPickIndex(state.currentPickIndex);
      setTeams(state.teams);
      setPicks(state.picks);
    });

    newSocket.on('draft_started', (data) => {
      setStatus(data.status);
      setCurrentPickIndex(data.currentPickIndex);
      setTeams(data.teams);
    });

    newSocket.on('pick_made', (data) => {
      setPicks(prev => [...prev, data.pick]);
      setCurrentPickIndex(data.nextPickIndex);
      setStatus(data.status);
      
      // Play a nice draft sound if possible (optional)
    });

    newSocket.on('draft_error', (data) => {
      alert(data.message);
    });

    return () => newSocket.close();
  }, [id]);

  const numTeams = teams.length;

  // Draft Board Matrix
  // IMPORTANT: This hook must run on EVERY render.
  // Do not place it below the loading return.
  const draftBoard = useMemo(() => {
    if (numTeams === 0) return [];
  
    const board = Array(15)
      .fill(null)
      .map(() => Array(numTeams).fill(null));
  
    picks.forEach(p => {
      const pIdx = p.pickNumber - 1;
      const r = Math.floor(pIdx / numTeams);
  
      if (r >= 0 && r < 15) {
        const c =
          r % 2 === 0
            ? pIdx % numTeams
            : numTeams - 1 - (pIdx % numTeams);
  
        if (c >= 0 && c < numTeams) {
          board[r][c] = p;
        }
      }
    });
  
    return board;
  }, [picks, numTeams]);
  
  // Loading state must come AFTER all hooks.
  if (!currentUser || !league) {
    return (
      <div
        className="page-container"
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100vh',
          fontSize: '1.5rem'
        }}
      >
        Loading Draft Room...
      </div>
    );
  }
  
  const myTeam = teams.find(t => t.userId === currentUser.id);
  const isOwner = league.ownerId === currentUser.id;
  
  const startDraft = () => {
    if (socket) {
      socket.emit('start_draft', { leagueId: id });
    }
  };
  
  const draftPlayer = (playerId) => {
    if (!myTeam) return;
  
    if (socket) {
      socket.emit('draft_pick', {
        leagueId: id,
        teamId: myTeam.id,
        playerId
      });
    }
  };
  
  let currentTeamTurn = null;
  let round = 1;
  let pickInRound = 0;
  
  if (status === 'DRAFTING' && numTeams > 0) {
    round = Math.floor(currentPickIndex / numTeams) + 1;
    pickInRound = currentPickIndex % numTeams;
  
    const expectedDraftOrder =
      round % 2 !== 0
        ? pickInRound + 1
        : numTeams - pickInRound;
  
    currentTeamTurn = teams.find(
      t => t.draftOrder === expectedDraftOrder
    );
  }
  
  const isMyTurn =
    currentTeamTurn &&
    myTeam &&
    currentTeamTurn.id === myTeam.id;
  
  const sortedTeams = [...teams].sort(
    (a, b) =>
      (a.draftOrder || 99) -
      (b.draftOrder || 99)
  );
  
  const draftedPlayerIds = new Set(
    picks.map(p => p.playerId)
  );
  
  const undraftedPlayers = availablePlayers
    .filter(p => !draftedPlayerIds.has(p.id))
    .filter(
      p =>
        p.name
          .toLowerCase()
          .includes(searchQuery.toLowerCase()) ||
        p.position
          .toLowerCase()
          .includes(searchQuery.toLowerCase()) ||
        p.team
          .toLowerCase()
          .includes(searchQuery.toLowerCase())
    );

  return (
    <div className="page-container" style={{ maxWidth: '1600px', padding: '0 1rem' }}>
      
      {/* Draft Header Strip */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(20,20,30,0.9), rgba(10,10,15,0.95))',
        border: '1px solid var(--glass-border)',
        borderRadius: '16px',
        padding: '1.5rem 2rem',
        marginBottom: '1.5rem',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        backdropFilter: 'blur(10px)'
      }}>
        <div>
          <h1 style={{ margin: '0 0 0.5rem 0', fontSize: '2rem', background: 'linear-gradient(to right, #fff, #aaa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            {league.name}
          </h1>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <span style={{ 
              background: status === 'DRAFTING' ? 'rgba(74, 222, 128, 0.2)' : 'rgba(255,255,255,0.1)', 
              color: status === 'DRAFTING' ? '#4ade80' : '#fff',
              padding: '0.3rem 0.8rem', borderRadius: '20px', fontSize: '0.85rem', fontWeight: 'bold', textTransform: 'uppercase' 
            }}>
              {status}
            </span>
            {status === 'DRAFTING' && (
              <span style={{ color: 'var(--text-secondary)', fontSize: '1.1rem' }}>Round {round} • Pick {currentPickIndex + 1}</span>
            )}
          </div>
        </div>

        <div>
          {status === 'PREDRAFT' && isOwner && (
            <button className="btn-primary" onClick={startDraft} style={{ fontSize: '1.2rem', padding: '0.8rem 2rem' }}>
              Launch Draft
            </button>
          )}
          {status === 'DRAFTING' && currentTeamTurn && (
            <div style={{ 
              display: 'flex', alignItems: 'center', gap: '1.5rem',
              background: isMyTurn ? 'linear-gradient(90deg, rgba(74, 222, 128, 0.1), rgba(74, 222, 128, 0.2))' : 'rgba(0,0,0,0.3)',
              border: isMyTurn ? '1px solid #4ade80' : '1px solid var(--glass-border)',
              padding: '1rem 2rem',
              borderRadius: '12px',
              boxShadow: isMyTurn ? '0 0 20px rgba(74,222,128,0.2)' : 'none',
              transition: 'all 0.3s ease'
            }}>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '0.9rem', color: isMyTurn ? '#4ade80' : 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '1px' }}>
                  On The Clock
                </div>
                <div style={{ fontSize: '1.4rem', fontWeight: 'bold', color: '#fff' }}>
                  {isMyTurn ? 'YOUR TURN' : currentTeamTurn.name}
                </div>
              </div>
              {isMyTurn && <div className="pulsing-dot" style={{ width: '15px', height: '15px', background: '#4ade80', borderRadius: '50%', boxShadow: '0 0 10px #4ade80' }}></div>}
            </div>
          )}
          {status === 'SEASON' && (
            <div style={{ color: '#4ade80', fontWeight: 'bold', fontSize: '1.5rem', textShadow: '0 0 10px rgba(74,222,128,0.5)' }}>Draft Complete</div>
          )}
        </div>
      </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns:
                  '280px minmax(500px, 1fr) 280px',
                gap: '1.5rem',
                minHeight: 'calc(100vh - 220px)',
                alignItems: 'stretch'
              }}
            >
      
              {/* LEFT: DRAFT ORDER */}
              <div
                style={{
                  background: 'var(--glass-bg)',
                  borderRadius: '16px',
                  border: '1px solid var(--glass-border)',
                  display: 'flex',
                  flexDirection: 'column',
                  overflow: 'hidden'
                }}
              >
                <div
                  style={{
                    padding: '1rem',
                    borderBottom:
                      '1px solid var(--glass-border)',
                    background: 'rgba(0,0,0,0.2)'
                  }}
                >
                  <h3 style={{ margin: 0 }}>
                    Draft Order
                  </h3>
                </div>
      
                <div
                  style={{
                    overflowY: 'auto',
                    flex: 1
                  }}
                >
                  {sortedTeams.length === 0 && (
                    <p
                      style={{
                        padding: '1rem',
                        color:
                          'var(--text-secondary)'
                      }}
                    >
                      Waiting for teams...
                    </p>
                  )}
      
                  {sortedTeams.map((t, idx) => (
                    <div
                      key={t.id}
                      style={{
                        padding: '1rem',
                        borderBottom:
                          '1px solid rgba(255,255,255,0.05)',
                        background:
                          currentTeamTurn?.id === t.id
                            ? 'rgba(255,255,255,0.05)'
                            : 'transparent',
                        borderLeft:
                          currentTeamTurn?.id === t.id
                            ? '4px solid #4ade80'
                            : t.id === myTeam?.id
                              ? '4px solid var(--brand-red)'
                              : '4px solid transparent',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '1rem'
                      }}
                    >
                      <div
                        style={{
                          width: '24px',
                          height: '24px',
                          borderRadius: '50%',
                          background:
                            'rgba(255,255,255,0.1)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '0.8rem',
                          fontWeight: 'bold',
                          flexShrink: 0
                        }}
                      >
                        {idx + 1}
                      </div>
      
                      <div>
                        <div
                          style={{
                            fontWeight: 'bold',
                            color:
                              t.id === myTeam?.id
                                ? 'var(--brand-color)'
                                : '#fff'
                          }}
                        >
                          {t.name}
                        </div>
      
                        <div
                          style={{
                            fontSize: '0.8rem',
                            color:
                              'var(--text-secondary)'
                          }}
                        >
                          {
                            picks.filter(
                              p =>
                                p.teamId === t.id
                            ).length
                          }{' '}
                          players
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
      
              {/* CENTER: AVAILABLE PLAYERS */}
              <div
                style={{
                  background: 'var(--glass-bg)',
                  borderRadius: '16px',
                  border:
                    '1px solid var(--glass-border)',
                  display: 'flex',
                  flexDirection: 'column',
                  overflow: 'hidden',
                  minWidth: 0
                }}
              >
                <div
                  style={{
                    padding: '1rem 1.25rem',
                    borderBottom:
                      '1px solid var(--glass-border)',
                    background:
                      'rgba(0,0,0,0.2)',
                    display: 'flex',
                    justifyContent:
                      'space-between',
                    alignItems: 'center',
                    gap: '1rem'
                  }}
                >
                  <div>
                    <h2
                      style={{
                        margin: 0,
                        fontSize: '1.25rem'
                      }}
                    >
                      Available Players
                    </h2>
      
                    <div
                      style={{
                        color:
                          'var(--text-secondary)',
                        fontSize: '0.85rem',
                        marginTop: '0.25rem'
                      }}
                    >
                      {undraftedPlayers.length}{' '}
                      players available
                    </div>
                  </div>
      
                  <input
                    type="text"
                    className="search-input"
                    placeholder="Search players..."
                    value={searchQuery}
                    onChange={e =>
                      setSearchQuery(
                        e.target.value
                      )
                    }
                    style={{
                      width: '240px',
                      margin: 0,
                      background:
                        'rgba(0,0,0,0.2)',
                      border:
                        '1px solid rgba(255,255,255,0.1)',
                      borderRadius: '8px',
                      color: '#ffffff'
                    }}
                  />
                </div>
      
                <div
                  style={{
                    flex: 1,
                    overflowY: 'auto',
                    overflowX: 'auto'
                  }}
                >
                  {undraftedPlayers.length === 0 ? (
                    <div
                      style={{
                        padding: '4rem 2rem',
                        textAlign: 'center',
                        color:
                          'var(--text-secondary)'
                      }}
                    >
                      <div
                        style={{
                          fontSize: '1.2rem',
                          marginBottom:
                            '0.75rem'
                        }}
                      >
                        No available players found.
                      </div>
      
                      <div
                        style={{
                          fontSize: '0.9rem'
                        }}
                      >
                        The NFL player pool has not
                        loaded yet. Try refreshing the
                        Draft Room.
                      </div>
                    </div>
                  ) : (
                    <table
                      style={{
                        width: '100%',
                        borderCollapse:
                          'collapse'
                      }}
                    >
                      <thead
                        style={{
                          position: 'sticky',
                          top: 0,
                          background:
                            'var(--glass-bg)',
                          zIndex: 2,
                          backdropFilter:
                            'blur(10px)'
                        }}
                      >
                        <tr
                          style={{
                            color:
                              'var(--text-secondary)',
                            fontSize: '0.8rem',
                            textTransform:
                              'uppercase'
                          }}
                        >
                          <th
                            style={{
                              padding:
                                '0.9rem 1rem',
                              textAlign: 'left'
                            }}
                          >
                            Player
                          </th>
      
                          <th
                            style={{
                              padding:
                                '0.9rem',
                              textAlign: 'center'
                            }}
                          >
                            Pos
                          </th>
      
                          <th
                            style={{
                              padding:
                                '0.9rem',
                              textAlign: 'center'
                            }}
                          >
                            Team
                          </th>
      
                          <th
                            style={{
                              padding:
                                '0.9rem',
                              textAlign: 'center'
                            }}
                          >
                            Proj
                          </th>
      
                          <th
                            style={{
                              padding:
                                '0.9rem 1rem',
                              textAlign: 'right'
                            }}
                          >
                            Action
                          </th>
                        </tr>
                      </thead>
      
                      <tbody>
                        {undraftedPlayers
                          .slice(0, 100)
                          .map(p => {
                            const colors =
                              NFL_COLORS[p.team] ||
                              {
                                primary: '#333',
                                secondary: '#111'
                              };
      
                            return (
                              <tr
                                key={p.id}
                                className="player-row"
                                style={{
                                  borderBottom:
                                    '1px solid rgba(255,255,255,0.05)'
                                }}
                              >
                                <td
                                  style={{
                                    padding:
                                      '0.7rem 1rem'
                                  }}
                                >
                                  <div
                                    style={{
                                      display: 'flex',
                                      alignItems:
                                        'center',
                                      gap: '0.75rem'
                                    }}
                                  >
                                    {p.imageUrl ? (
                                      <img
                                        src={p.imageUrl}
                                        alt={p.name}
                                        style={{
                                          width:
                                            '42px',
                                          height:
                                            '42px',
                                          borderRadius:
                                            '50%',
                                          objectFit:
                                            'cover',
                                          flexShrink: 0
                                        }}
                                      />
                                    ) : (
                                      <div
                                        style={{
                                          width:
                                            '42px',
                                          height:
                                            '42px',
                                          borderRadius:
                                            '50%',
                                          background:
                                            `linear-gradient(135deg, ${colors.primary}, ${colors.secondary})`,
                                          display:
                                            'flex',
                                          alignItems:
                                            'center',
                                          justifyContent:
                                            'center',
                                          fontWeight:
                                            'bold',
                                          fontSize:
                                            '0.75rem',
                                          flexShrink: 0
                                        }}
                                      >
                                        {p.name
                                          .split(
                                            ' '
                                          )
                                          .map(
                                            n =>
                                              n[0]
                                          )
                                          .join('')}
                                      </div>
                                    )}
      
                                    <div>
                                      <div
                                        style={{
                                          fontWeight:
                                            'bold'
                                        }}
                                      >
                                        {p.name}
                                      </div>
      
                                      <div
                                        style={{
                                          fontSize:
                                            '0.75rem',
                                          color:
                                            'var(--text-secondary)'
                                        }}
                                      >
                                        {p.team}
                                        {' • '}
                                        #
                                        {p.jerseyNumber ||
                                          '—'}
                                      </div>
                                    </div>
                                  </div>
                                </td>
      
                                <td
                                  style={{
                                    padding:
                                      '0.7rem',
                                    textAlign:
                                      'center'
                                  }}
                                >
                                  <span
                                    style={{
                                      background:
                                        'rgba(255,255,255,0.1)',
                                      padding:
                                        '0.3rem 0.5rem',
                                      borderRadius:
                                        '4px',
                                      fontSize:
                                        '0.8rem'
                                    }}
                                  >
                                    {p.position}
                                  </span>
                                </td>
      
                                <td
                                  style={{
                                    padding:
                                      '0.7rem',
                                    textAlign:
                                      'center',
                                    fontWeight:
                                      'bold'
                                  }}
                                >
                                  {p.team}
                                </td>
      
                                <td
                                  style={{
                                    padding:
                                      '0.7rem',
                                    textAlign:
                                      'center',
                                    color:
                                      'var(--text-secondary)'
                                  }}
                                >
                                  {p.projectedPoints !=
                                  null
                                    ? `${Number(
                                        p.projectedPoints
                                      ).toFixed(
                                        1
                                      )}`
                                    : '—'}
                                </td>
      
                                <td
                                  style={{
                                    padding:
                                      '0.7rem 1rem',
                                    textAlign:
                                      'right'
                                  }}
                                >
                                  <button
                                    className="btn-primary"
                                    onClick={() =>
                                      draftPlayer(
                                        p.id
                                      )
                                    }
                                    disabled={
                                      !isMyTurn ||
                                      status !==
                                        'DRAFTING'
                                    }
                                    style={{
                                      opacity:
                                        !isMyTurn ||
                                        status !==
                                          'DRAFTING'
                                          ? 0.35
                                          : 1,
                                      padding:
                                        '0.5rem 1rem',
                                      borderRadius:
                                        '20px',
                                      whiteSpace:
                                        'nowrap'
                                    }}
                                  >
                                    {isMyTurn
                                      ? 'DRAFT'
                                      : 'WAIT'}
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
      
              {/* RIGHT: MY ROSTER */}
              <div
                style={{
                  background: 'var(--glass-bg)',
                  borderRadius: '16px',
                  border:
                    '1px solid var(--glass-border)',
                  display: 'flex',
                  flexDirection: 'column',
                  overflow: 'hidden'
                }}
              >
                <div
                  style={{
                    padding: '1rem',
                    borderBottom:
                      '1px solid var(--glass-border)',
                    background:
                      'rgba(0,0,0,0.2)',
                    display: 'flex',
                    justifyContent:
                      'space-between',
                    alignItems: 'center'
                  }}
                >
                  <h3 style={{ margin: 0 }}>
                    My Roster
                  </h3>
      
                  {myTeam && (
                    <span
                      style={{
                        fontSize: '0.8rem',
                        color:
                          'var(--text-secondary)'
                      }}
                    >
                      {
                        picks.filter(
                          p =>
                            p.teamId ===
                            myTeam.id
                        ).length
                      }
                      /15
                    </span>
                  )}
                </div>
      
                <div
                  style={{
                    overflowY: 'auto',
                    flex: 1,
                    padding: '1rem'
                  }}
                >
                  {!myTeam && (
                    <p
                      style={{
                        color:
                          'var(--text-secondary)'
                      }}
                    >
                      You are not in this league.
                    </p>
                  )}
      
                  {myTeam &&
                    picks
                      .filter(
                        p =>
                          p.teamId ===
                          myTeam.id
                      )
                      .map(p => (
                        <div
                          key={p.id}
                          style={{
                            background:
                              'rgba(255,255,255,0.05)',
                            padding: '0.8rem',
                            borderRadius:
                              '8px',
                            marginBottom:
                              '0.5rem',
                            borderLeft:
                              `3px solid ${
                                NFL_COLORS[
                                  p.player.team
                                ]?.primary ||
                                '#888'
                              }`
                          }}
                        >
                          <div
                            style={{
                              fontWeight:
                                'bold'
                            }}
                          >
                            {p.player.name}
                          </div>
      
                          <div
                            style={{
                              fontSize:
                                '0.8rem',
                              color:
                                'var(--text-secondary)'
                            }}
                          >
                            {p.player.position}
                            {' • '}
                            {p.player.team}
                          </div>
                        </div>
                      ))}
      
                  {myTeam &&
                    picks.filter(
                      p =>
                        p.teamId ===
                        myTeam.id
                    ).length === 0 && (
                      <div
                        style={{
                          textAlign:
                            'center',
                          color:
                            'var(--text-secondary)',
                          marginTop:
                            '2rem'
                        }}
                      >
                        No players drafted yet.
                      </div>
                    )}
                </div>
              </div>
            </div>

      <style jsx>{`
        .player-row:hover {
          background: rgba(255,255,255,0.1) !important;
        }
        @keyframes pulse {
          0% { box-shadow: 0 0 0 0 rgba(74, 222, 128, 0.7); }
          70% { box-shadow: 0 0 0 10px rgba(74, 222, 128, 0); }
          100% { box-shadow: 0 0 0 0 rgba(74, 222, 128, 0); }
        }
        .pulsing-dot {
          animation: pulse 2s infinite;
        }
      `}</style>
    </div>
  );
}
