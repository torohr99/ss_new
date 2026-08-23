'use client';

import { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import axios from 'axios';
import { useAuth } from '../../../context/AuthContext';
import MemeEditor from '../../../../components/MemeEditor';
import { LiveStats } from '../../../../components/gamecast';

export default function GameHubPage({ params }) {
  const { league, id: gameId } = params;
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [readOnly, setReadOnly] = useState(false);
  const [readOnlyReason, setReadOnlyReason] = useState('Connecting to chat...');
  const [connected, setConnected] = useState(false);
  
  const { user } = useAuth();
  
  // Modals
  const [showMemeModal, setShowMemeModal] = useState(false);
  const [showStatsModal, setShowStatsModal] = useState(false);
  
  // Meme State
  const [memeInput, setMemeInput] = useState('');
  const [memeGenerating, setMemeGenerating] = useState(false);
  const [generatedCandidates, setGeneratedCandidates] = useState([]);
  const [selectedCandidate, setSelectedCandidate] = useState(null);
  
  // Game & Stats Data
  const [gameData, setGameData] = useState(null);
  const [stats, setStats] = useState(null);

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
        const token = localStorage.getItem('smack_token');
        socket = io((process.env.NEXT_PUBLIC_API_URL || `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'}`), {
          auth: token ? { token } : {}
        });

        socketRef.current = socket;

        socket.on('connect', () => {
          setConnected(true);
          socket.emit('join_game', { league, gameId }, (response) => {
            if (response.success) {
              setMessages(response.messages || []);
              setReadOnly(response.readOnly);
              setReadOnlyReason(response.readOnlyReason);
            } else {
              setReadOnly(true);
              setReadOnlyReason(response.message || 'Error joining game');
            }
          });
        });

        socket.on('new_message', (msg) => {
          setMessages((prev) => {
            const exists = prev.find(m => m.id === msg.id);
            if (exists) return prev.map(m => m.id === msg.id ? msg : m);
            return [...prev, msg];
          });
        });

        socket.on('poll_updated', (updatedMsg) => {
          setMessages((prev) => prev.map(m => m.id === updatedMsg.id ? updatedMsg : m));
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

  const handleGenerateMeme = async (e) => {
    e.preventDefault();
    if (!memeInput.trim()) return;
    setMemeGenerating(true);
    setGeneratedCandidates([]);
    setSelectedCandidate(null);
    
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'}/api/ai/meme`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('smack_token')}` },
        body: JSON.stringify({ prompt: memeInput })
      });
      if (res.ok) {
        const data = await res.json();
        setGeneratedCandidates(data.candidates);
      } else {
        alert('Failed to generate meme');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setMemeGenerating(false);
    }
  };

  const publishMeme = (dataUrl) => {
    handleSendMessage(null, `[MEME] ${dataUrl}`);
    setShowMemeModal(false);
    setGeneratedCandidates([]);
    setSelectedCandidate(null);
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
                <span>• {new Date(msg.created_at).toLocaleTimeString()}</span>
              </div>
              
              {msg.type === 'poll' ? (
                <div>
                  <strong>{msg.poll_question}</strong>
                  <div style={{ marginTop: '0.5rem', display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                    {msg.poll_options.map((opt, i) => (
                      <button key={i} onClick={() => handleVotePoll(msg.id, opt)} className="btn-secondary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}>
                        {opt}
                      </button>
                    ))}
                  </div>
                  <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                    {msg.poll_options.map(o => {
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
          <div style={{ background: 'var(--glass-bg)', padding: '2rem', borderRadius: '12px', maxWidth: '800px', width: '100%', border: '1px solid var(--glass-border)', maxHeight: '90vh', overflowY: 'auto' }}>
            {!selectedCandidate ? (
              <>
                <h2 style={{marginTop: 0}}>AI Meme Generator</h2>
                <form onSubmit={handleGenerateMeme} style={{ display: 'flex', gap: '1rem', marginBottom: '2rem' }}>
                  <input type="text" className="form-input" placeholder="Describe your meme (e.g., Aaron Judge celebrating)" value={memeInput} onChange={e => setMemeInput(e.target.value)} style={{ flex: 1 }} />
                  <button type="submit" className="btn-primary" disabled={memeGenerating}>
                    {memeGenerating ? 'Generating...' : 'Generate'}
                  </button>
                </form>

                {generatedCandidates.length > 0 && (
                  <div style={{ display: 'flex', gap: '1rem', overflowX: 'auto', paddingBottom: '1rem' }}>
                    {generatedCandidates.map((c, i) => (
                      <div key={i} style={{ cursor: 'pointer', border: '2px solid transparent', borderRadius: '8px' }} onClick={() => setSelectedCandidate(c)}>
                        <img src={c} alt="Candidate" style={{ height: '150px', borderRadius: '6px' }} />
                        <div style={{ textAlign: 'center', marginTop: '0.5rem' }}>Select Option {i+1}</div>
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ textAlign: 'right' }}>
                  <button className="btn-secondary" onClick={() => setShowMemeModal(false)}>Close</button>
                </div>
              </>
            ) : (
              <MemeEditor sourceImage={selectedCandidate} onPublish={publishMeme} onCancel={() => setSelectedCandidate(null)} />
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
