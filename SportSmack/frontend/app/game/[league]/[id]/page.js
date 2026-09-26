'use client';

import { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import axios from 'axios';
import { useAuth } from '../../../context/AuthContext';
import MemeEditor from '../../../../components/MemeEditor';
import {
    LiveStats,
    LiveAIAnalysis,
    PostGameAnalysis,
    GameAssistant
} from '../../../../components/gamecast';

function normalizeChatMessage(message) {
  if (!message) return null;

  const normalized = {
    ...message,

    createdAt:
      message.createdAt ||
      message.created_at ||
      null,

    poll_question:
      message.poll_question ||
      null,

    poll_options:
      Array.isArray(message.poll_options)
        ? message.poll_options
        : [],

    poll_results: {},

    poll_voted: false
  };

  /*
   * Poll state is stored in content as:
   * [POLL_JSON]{...}
   */
  if (
    message.type === 'poll' &&
    typeof message.content === 'string' &&
    message.content.startsWith('[POLL_JSON]')
  ) {
    try {
      const pollData =
        JSON.parse(
          message.content.substring(
            '[POLL_JSON]'.length
          )
        );

      normalized.poll_question =
        pollData.question ||
        message.poll_question ||
        'Poll';

      normalized.poll_options =
        Array.isArray(
          pollData.options
        )
          ? pollData.options
          : [];

      /*
       * IMPORTANT:
       *
       * poll_results is the authoritative
       * vote-count field after a vote.
       *
       * Fall back to the original content
       * votes only when poll_results does
       * not exist yet.
       */
      let databaseResults = {};

      try {
        databaseResults =
          JSON.parse(
            message.poll_results ||
              '{}'
          );
      } catch (error) {
        databaseResults = {};
      }

      const contentVotes =
        pollData.votes &&
        typeof pollData.votes === 'object'
          ? pollData.votes
          : {};

      normalized.poll_results =
        Object.keys(databaseResults).length > 0
          ? databaseResults
          : contentVotes;

      /*
       * Determine whether the current user
       * has already voted.
       *
       * The backend stores voted user IDs
       * inside the poll JSON.
       */
      const votedUsers =
        Array.isArray(
          pollData.votedUsers
        )
          ? pollData.votedUsers
          : [];

      normalized.poll_voted =
        user?.id != null &&
        votedUsers.some(
          id =>
            String(id) ===
            String(user.id)
        );

    } catch (error) {
      console.error(
        'Failed to parse poll data:',
        error
      );
    }
  }

  if (!Array.isArray(
    normalized.poll_options
  )) {
    normalized.poll_options = [];
  }

  if (
    !normalized.poll_results ||
    typeof normalized.poll_results !==
      'object'
  ) {
    normalized.poll_results = {};
  }

  return normalized;
}

export default function GameHubPage({ params }) {
  const { league, id: gameId } = params;
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [readOnly, setReadOnly] = useState(false);
  const [readOnlyReason, setReadOnlyReason] = useState('Connecting to chat...');
  const [connected, setConnected] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState(null);
  const [liveAiAnalysis, setLiveAiAnalysis] =
  useState(null);
  
  const { user } = useAuth();
  
  // Modals
  const [showMemeModal, setShowMemeModal] = useState(false);
  const [showStatsModal, setShowStatsModal] = useState(false);
  
  // Meme State
  const [memeInput, setMemeInput] = useState('');
  const [memeGenerating, setMemeGenerating] = useState(false);
  const [generatedMeme, setGeneratedMeme] =
    useState(null);
  
  // Game & Stats Data
  const [gameData, setGameData] = useState(null);

  const [stats, setStats] = useState(null);
  
  const [postGameAnalysis, setPostGameAnalysis] =
    useState(null);

  const [postGameAnalysisLoading, setPostGameAnalysisLoading] =
    useState(false);

  const socketRef = useRef(null);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    const fetchGameSummary = async () => {
      try {
        const res = await axios.get(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'}/api/sports/${league}/game/${gameId}`, { withCredentials: true });
        setGameData(res.data);
      } catch (err) {
        console.error('Failed to fetch game summary', err);
      }
    };
    fetchGameSummary();
  }, [league, gameId]);

    useEffect(() => {
        if (
            !gameData ||
            gameData.status !== 'post'
        ) {
            return;
        }
    
        let cancelled = false;
    
        const fetchPostGameAnalysis =
            async () => {
                setPostGameAnalysisLoading(true);
    
                try {
                    const res =
                        await axios.get(
                            `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'}/api/gamecast/${league}/${gameId}/postgame-analysis`
                        );
    
                    if (!cancelled) {
                        setPostGameAnalysis(
                            res.data
                        );
                    }
                } catch (error) {
                    console.error(
                        'Failed to fetch post-game AI analysis:',
                        error
                    );
                } finally {
                    if (!cancelled) {
                        setPostGameAnalysisLoading(
                            false
                        );
                    }
                }
            };
    
        fetchPostGameAnalysis();
    
        return () => {
            cancelled = true;
        };
    }, [gameData, league, gameId]);

  // Fetch stats when modal is opened, and interval it
  useEffect(() => {
    let interval;
    const fetchStats = async () => {
      try {
        const res = await axios.get(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'}/api/gamecast/${league}/${gameId}/stats`);
        setStats(res.data);
      } catch (err) {
        console.error('Failed to fetch live stats', err);
      }
    };

    if (showStatsModal) {
      fetchStats();
      interval = setInterval(fetchStats, 30000);
    }
    return () => clearInterval(interval);
  }, [league, gameId, showStatsModal]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    let socket = null;

    const connectToSocket = async () => {
      try {
        const socket = io(
            process.env.NEXT_PUBLIC_API_URL ||
            'http://localhost:5000',
            {
                withCredentials: true,
                transports: ['websocket']
            }
        );

        socketRef.current = socket;

        socket.on('connect', () => {
          setConnected(true);
          socket.emit('join_game', { league, gameId }, (response) => {
            if (response.success) {
              setMessages(
                  Array.isArray(response.messages)
                      ? response.messages
                          .map(normalizeChatMessage)
                          .filter(Boolean)
                      : []
              );
              if (response.aiAnalysis) {
                setAiAnalysis(response.aiAnalysis);
              }
              setReadOnly(response.readOnly);
              setReadOnlyReason(response.readOnlyReason);
            } else {
              setReadOnly(true);
              setReadOnlyReason(response.message || 'Error joining game');
            }
          });
        });

        socket.on('new_message', (msg) => {

            const normalizedMessage = normalizeChatMessage(msg);
        
            if (!normalizedMessage) return;
        
            setMessages((prev) => {
        
                const exists = prev.find(
                    m => m.id === normalizedMessage.id
                );
        
                if (exists) {
                    return prev.map(
                        m =>
                            m.id === normalizedMessage.id
                                ? normalizedMessage
                                : m
                    );
                }
        
                return [...prev, normalizedMessage];
        
            });
        
        });

        socket.on(
          'live_ai_analysis',
          (analysis) => {
            if (!analysis) return;
        
            setLiveAiAnalysis(analysis);
          }
        );
        
        socket.on('poll_updated', (updatedMsg) => {

            const normalizedMessage =
                normalizeChatMessage(updatedMsg);
        
            if (!normalizedMessage) return;
        
            setMessages((prev) =>
                prev.map(m =>
                    m.id === normalizedMessage.id
                        ? normalizedMessage
                        : m
                )
            );
        
        });

        socket.on('connect_error', () => {
          setReadOnly(true);
          setReadOnlyReason('Connection Error.');
        });
      } catch (error) {
        console.error(error);
      }
    };

    connectToSocket();

    return () => {
      if (socket) socket.disconnect();
    };
  }, [league, gameId]);

  const handleSendMessage = (e, overrideMessage = null) => {
    if (e) e.preventDefault();
    const txt = overrideMessage || newMessage;
    if (!txt.trim() || readOnly) return;
    
    socketRef.current.emit('send_message', { league, gameId, content: txt }, (res) => {
      if (res && res.success) {
        setNewMessage('');
      } else {
        alert('Failed to send message');
      }
    });
  };

  const handleGenerateMeme =
      async (e) => {
        e.preventDefault();
    
        if (!memeInput.trim()) {
          return;
        }
    
        setMemeGenerating(true);
        setGeneratedMeme(null);
    
        try {
          const competitors =
            gameData?.header?.competitions?.[0]
              ?.competitors ||
            gameData?.competitors ||
            [];
    
          const home =
            competitors.find(
              c =>
                c.homeAway === 'home'
            );
    
          const away =
            competitors.find(
              c =>
                c.homeAway === 'away'
            );
    
          const gameContext = {
            league,
    
            homeTeam:
              home?.team?.displayName ||
              home?.team?.name ||
              gameData?.homeTeam ||
              null,
    
            awayTeam:
              away?.team?.displayName ||
              away?.team?.name ||
              gameData?.awayTeam ||
              null,
    
            score:
              home?.score != null &&
              away?.score != null
                ? `${
                    away?.team?.displayName ||
                    'Away'
                  } ${away.score} - ${
                    home?.team?.displayName ||
                    'Home'
                  } ${home.score}`
                : null,
    
            status:
              gameData?.status ||
              gameData?.statusDetail ||
              null,
    
            situation:
              gameData?.situation ||
              null
          };
    
          const res =
            await fetch(
              `${
                process.env
                  .NEXT_PUBLIC_API_URL ||
                'http://localhost:5000'
              }/api/ai/meme`,
              {
                method: 'POST',
    
                headers: {
                  'Content-Type':
                    'application/json'
                },
    
                credentials:
                  'include',
    
                body:
                  JSON.stringify({
                    prompt:
                      memeInput,
                    league,
                    gameId,
                    gameContext
                  })
              }
            );
    
          if (!res.ok) {
            const errorData =
              await res
                .json()
                .catch(
                  () => ({})
                );
    
            throw new Error(
              errorData.message ||
              'Failed to generate meme'
            );
          }
    
          const data =
            await res.json();
    
          setGeneratedMeme(
            data.image || null
          );
    
        } catch (err) {
          console.error(
            'AI meme generation error:',
            err
          );
    
          alert(
            err.message ||
            'Failed to generate meme'
          );
    
        } finally {
          setMemeGenerating(false);
        }
      };

  const publishMeme = (
      dataUrl
    ) => {
      handleSendMessage(
        null,
        `[MEME] ${dataUrl}`
      );
    
      setShowMemeModal(false);
      setGeneratedMeme(null);
      setMemeInput('');
    };

  const handleVotePoll = (messageId, option) => {
    if (readOnly) return;
    socketRef.current.emit('vote_poll', { messageId, option });
  };

  return (
    <div className="page-container" style={{ maxWidth: '900px', margin: '0 auto' }}>
      
      {/* HEADER */}
      <div className="profile-header" style={{ background: 'var(--glass-bg)', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--glass-border)', marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ margin: '0 0 0.5rem 0' }}>{gameData ? gameData.name : 'Live Chat'}</h1>
          <p style={{ margin: 0, opacity: 0.8 }}>Join the conversation for this {league.toUpperCase()} game.</p>
        </div>
        <button className="btn-secondary" onClick={() => setShowStatsModal(true)}>
          Live Stats
        </button>
      </div>

      {liveAiAnalysis && (
          <LiveAIAnalysis
            data={liveAiAnalysis}
          />
        )}

      {postGameAnalysis && (
          <PostGameAnalysis
              data={postGameAnalysis}
          />
      )}

      <GameAssistant
          league={league}
          gameId={gameId}
      />

      {postGameAnalysisLoading && (
          <div
              style={{
                  background:
                      'var(--glass-bg)',
                  padding: '1rem',
                  borderRadius: '12px',
                  marginBottom: '1rem'
              }}
          >
              Generating post-game AI analysis...
          </div>
      )}

      {/* CHAT INTERFACE */}
      <div style={{ background: 'var(--glass-bg)', padding: '1rem', borderRadius: '12px', border: '1px solid var(--glass-border)', minHeight: '600px', display: 'flex', flexDirection: 'column' }}>
        
        <div style={{ flex: 1, overflowY: 'auto', marginBottom: '1rem', display: 'flex', flexDirection: 'column', gap: '0.8rem', paddingRight: '0.5rem' }}>
          {messages.map((msg) => (
            <div key={msg.id} style={{ alignSelf: msg.user_id === user?.id ? 'flex-end' : 'flex-start', background: msg.user_id === user?.id ? 'var(--primary-color)' : 'rgba(255,255,255,0.1)', padding: '0.8rem 1rem', borderRadius: '12px', maxWidth: '70%' }}>
              <div style={{ fontSize: '0.8rem', opacity: 0.7, marginBottom: '0.2rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <span>{msg.user?.username || 'Unknown'}</span>
                {msg.userTeamBadge && (
                  <span style={{ 
                    background: msg.userTeamBadge.color, 
                    color: '#fff', 
                    padding: '0.1rem 0.4rem', 
                    borderRadius: '4px', 
                    fontSize: '0.65rem',
                    fontWeight: 'bold'
                  }}>
                    {msg.userTeamBadge.abbreviation}
                  </span>
                )}
                <span>
                  • {msg.createdAt
                    ? new Date(msg.createdAt).toLocaleTimeString()
                    : ''}
                </span>

                {msg.user?.id !== user?.id &&
                  msg.type !== 'poll' && (
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          const apiUrl =
                            process.env.NEXT_PUBLIC_API_URL ||
                            'http://localhost:5000';
                
                          const response =
                            await fetch(
                              `${apiUrl}/api/moderation/report`,
                              {
                                method: 'POST',
                                credentials: 'include',
                                headers: {
                                  'Content-Type':
                                    'application/json'
                                },
                                body: JSON.stringify({
                                  targetType:
                                    'GAME_MESSAGE',
                                  targetId:
                                    String(msg.id),
                                  reason:
                                    'HARASSMENT',
                                  details:
                                    'Reported from game chat.'
                                })
                              }
                            );
                
                          const data =
                            await response.json();
                
                          if (!response.ok) {
                            alert(
                              data.message ||
                              'Unable to submit report.'
                            );
                            return;
                          }
                
                          alert(
                            'Report submitted. The message will be automatically reviewed.'
                          );
                        } catch (error) {
                          console.error(
                            'Chat report error:',
                            error
                          );
                
                          alert(
                            'Unable to submit report.'
                          );
                        }
                      }}
                      style={{
                        border: 'none',
                        background: 'transparent',
                        color: 'var(--text-secondary)',
                        fontSize: '0.65rem',
                        cursor: 'pointer',
                        padding: 0
                      }}
                    >
                      Report
                    </button>
                )}
              </div>
              
              {msg.type === 'poll' ? (
                <div>
                  <strong>{msg.poll_question}</strong>
                  {!msg.poll_voted && (
                      <div
                        style={{
                          marginTop: '0.5rem',
                          display: 'flex',
                          flexWrap: 'wrap',
                          gap: '0.5rem'
                        }}
                      >
                        {(
                          Array.isArray(msg.poll_options)
                            ? msg.poll_options
                            : []
                        ).map((opt, i) => (
                          <button
                            key={i}
                            onClick={() =>
                              handleVotePoll(
                                msg.id,
                                opt
                              )
                            }
                            className="btn-secondary"
                            style={{
                              padding:
                                '0.4rem 0.8rem',
                              fontSize:
                                '0.85rem'
                            }}
                          >
                            {opt}
                          </button>
                        ))}
                      </div>
                    )}

                    {msg.poll_voted && (
                      <div
                        style={{
                          marginTop: '0.5rem',
                          fontSize: '0.8rem',
                          opacity: 0.7
                        }}
                      >
                        You voted in this poll.
                      </div>
                    )}
                  <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                    {(Array.isArray(msg.poll_options) ? msg.poll_options : []).map(o => {
                      const votes = (msg.poll_results || {})[o] || 0;
                      const totalVotes = Object.values(msg.poll_results || {}).reduce((a,b)=>a+b, 0) || 1;
                      const percent = Math.round((votes/totalVotes)*100);
                      return (
                        <div key={o} style={{ display: 'flex', justifyContent: 'space-between', background: 'rgba(0,0,0,0.2)', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>
                          <span>{o}</span>
                          <span>{percent}% ({votes} votes)</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : msg.content.startsWith('[MEME]') ? (
                <img src={msg.content.replace('[MEME] ', '')} alt="Meme" style={{ maxWidth: '100%', borderRadius: '8px', marginTop: '0.5rem' }} />
              ) : (
                <div style={{ wordBreak: 'break-word', lineHeight: '1.4' }}>{msg.content}</div>
              )}
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {readOnly ? (
          <div style={{ padding: '1rem', background: 'rgba(255,0,0,0.1)', textAlign: 'center', color: '#ff6b6b', borderRadius: '8px' }}>
            {readOnlyReason}
          </div>
        ) : (
          <form onSubmit={handleSendMessage} style={{ display: 'flex', gap: '0.8rem', background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: '8px' }}>
            <button type="button" className="btn-secondary" onClick={() => setShowMemeModal(true)} title="AI Meme Generator" style={{ padding: '0.5rem 1rem', fontSize: '1.2rem' }}>+</button>
            <input 
              type="text" 
              className="form-input" 
              placeholder="Join the conversation..." 
              value={newMessage} 
              onChange={e => setNewMessage(e.target.value)} 
              style={{ flex: 1, borderRadius: '20px' }} 
            />
            <button type="submit" className="btn-primary" style={{ borderRadius: '20px', padding: '0.5rem 1.5rem' }}>Send</button>
          </form>
        )}
      </div>

      {/* MEME GENERATOR MODAL */}
      {showMemeModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
          <div style={{ background: 'var(--glass-bg)', padding: '2rem', borderRadius: '12px', maxWidth: '860px', width: '100%', border: '1px solid var(--glass-border)', maxHeight: '90vh', overflowY: 'auto' }}>
            {!generatedMeme ? (
              <>
                <h2 style={{ marginTop: 0 }}>
                  AI Meme Generator
                </h2>
            
                <p
                  style={{
                    color: 'var(--text-secondary)',
                    marginTop: '-0.5rem',
                    marginBottom: '1.5rem',
                    fontSize: '0.9rem'
                  }}
                >
                  Describe the meme you want. SportSmack will
                  automatically use the current game's teams,
                  score, situation, and identified players to
                  make the image more accurate.
                </p>
            
                <form
                  onSubmit={handleGenerateMeme}
                  style={{
                    display: 'flex',
                    gap: '1rem',
                    marginBottom: '2rem'
                  }}
                >
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g., Aaron Judge pointing after a home run, celebrating wildly in Yankee Stadium"
                    value={memeInput}
                    onChange={e =>
                      setMemeInput(e.target.value)
                    }
                    style={{ flex: 1 }}
                  />
            
                  <button
                    type="submit"
                    className="btn-primary"
                    disabled={memeGenerating}
                  >
                    {memeGenerating
                      ? 'Generating...'
                      : 'Generate'}
                  </button>
                </form>
            
                {memeGenerating && (
                  // existing loading UI
                )}
            
                <div style={{ textAlign: 'right' }}>
                  <button
                    className="btn-secondary"
                    onClick={() => {
                      setShowMemeModal(false);
                      setGeneratedMeme(null);
                      setMemeInput('');
                    }}
                  >
                    Close
                  </button>
                </div>
              </>
            ) : (
              <MemeEditor
                sourceImage={generatedMeme}
                onPublish={publishMeme}
                onCancel={() =>
                  setGeneratedMeme(null)
                }
              />
            )}
          </div>
        </div>
      )}

      {/* LIVE STATS MODAL */}
      {showStatsModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
          <div style={{ background: 'var(--background-color)', padding: '2rem', borderRadius: '12px', maxWidth: '800px', width: '100%', border: '1px solid var(--glass-border)', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h2 style={{margin: 0}}>Live Matchup Stats</h2>
              <button className="btn-secondary" onClick={() => setShowStatsModal(false)}>Close</button>
            </div>
            <LiveStats statsData={stats} />
          </div>
        </div>
      )}

    </div>
  );
}
