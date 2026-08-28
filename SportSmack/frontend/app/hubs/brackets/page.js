'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import TOURNAMENT_TEAMS from './teams.json';

export default function BracketChallenge() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState(null);
  const [bracketState, setBracketState] = useState('welcome'); // 'welcome', 'create', 'picks'
  const [leagueName, setLeagueName] = useState('');
  
  // picks map key format: `region_round_matchIndex` or `final4_matchIndex` or `champ_0`
  const [picks, setPicks] = useState({});

  useEffect(() => {
    const init = async () => {
      try {
        const userRes = await axios.get(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'}/api/auth/me`, { credentials: 'include' });
        setCurrentUser(userRes.data);
      } catch (err) {
        console.error(err);
      }
    };
    init();
  }, []);

  const handlePick = (key, team) => {
    if (!team) return;

    setPicks(prev => {
      const newPicks = { ...prev, [key]: team };
      
      // Auto-clear downstream picks if this changes a previous choice
      const parts = key.split('_');
      if (parts[0] !== 'final4' && parts[0] !== 'champ') {
        const region = parts[0];
        const round = parseInt(parts[1]);
        const matchIndex = parseInt(parts[2]);
        
        let currentRound = round;
        let currentMatch = matchIndex;
        
        while (currentRound < 4) { // Up to regional final (round 3)
          const nextRound = currentRound + 1;
          const nextMatch = Math.floor(currentMatch / 2);
          const nextKey = `${region}_${nextRound}_${nextMatch}`;
          
          if (newPicks[nextKey] && newPicks[nextKey].id !== team.id) {
            // Delete conflicting downstream picks
            delete newPicks[nextKey];
          }
          currentRound = nextRound;
          currentMatch = nextMatch;
        }

        // Handle cascading into Final 4
        if (round === 3) {
          const f4Key = `final4_${region === 'East' || region === 'West' ? 0 : 1}`;
          if (newPicks[f4Key] && newPicks[f4Key].id !== team.id) {
             delete newPicks[f4Key];
             delete newPicks['champ_0'];
          }
        }
      } else if (parts[0] === 'final4') {
        const champKey = 'champ_0';
        if (newPicks[champKey] && newPicks[champKey].id !== team.id) {
          delete newPicks[champKey];
        }
      }

      return newPicks;
    });
  };

  const getMatchupTeams = (region, round, matchIndex) => {
    if (round === 0) {
      return [
        TOURNAMENT_TEAMS[region][matchIndex * 2],
        TOURNAMENT_TEAMS[region][matchIndex * 2 + 1]
      ];
    } else {
      // Look up picks from the previous round
      const prevKey1 = `${region}_${round - 1}_${matchIndex * 2}`;
      const prevKey2 = `${region}_${round - 1}_${matchIndex * 2 + 1}`;
      return [
        picks[prevKey1] || null,
        picks[prevKey2] || null
      ];
    }
  };

  const renderMatchup = (key, team1, team2) => {
    const winner = picks[key];
    return (
      <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginBottom: '1rem', background: 'var(--bg-primary)', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border)', minWidth: '160px' }}>
        <button 
          onClick={() => handlePick(key, team1)}
          disabled={!team1}
          style={{ 
            display: 'flex', alignItems: 'center', textAlign: 'left', padding: '0.4rem', border: 'none', borderRadius: '4px', cursor: team1 ? 'pointer' : 'default',
            background: (winner && team1 && winner.id === team1.id) ? (team1.color || 'var(--brand-red)') : 'transparent',
            color: (winner && team1 && winner.id === team1.id) ? 'white' : 'var(--text-primary)',
            fontSize: '0.85rem'
          }}>
          {team1 ? (
            <>
              <span style={{ color: winner?.id === team1?.id ? 'rgba(255,255,255,0.7)' : 'gray', marginRight: '6px', fontSize: '0.75rem', width: '14px' }}>{team1.seed}</span> 
              {team1.logo && <img src={team1.logo} alt={team1.name} style={{ width: '16px', height: '16px', marginRight: '6px', objectFit: 'contain' }} />}
              <span style={{ fontWeight: winner?.id === team1?.id ? 'bold' : 'normal' }}>{team1.name}</span>
            </>
          ) : <span style={{color:'gray', marginLeft: '20px'}}>TBD</span>}
        </button>
        <button 
          onClick={() => handlePick(key, team2)}
          disabled={!team2}
          style={{ 
            display: 'flex', alignItems: 'center', textAlign: 'left', padding: '0.4rem', border: 'none', borderRadius: '4px', cursor: team2 ? 'pointer' : 'default',
            background: (winner && team2 && winner.id === team2.id) ? (team2.color || 'var(--brand-red)') : 'transparent',
            color: (winner && team2 && winner.id === team2.id) ? 'white' : 'var(--text-primary)',
            fontSize: '0.85rem'
          }}>
          {team2 ? (
            <>
              <span style={{ color: winner?.id === team2?.id ? 'rgba(255,255,255,0.7)' : 'gray', marginRight: '6px', fontSize: '0.75rem', width: '14px' }}>{team2.seed}</span> 
              {team2.logo && <img src={team2.logo} alt={team2.name} style={{ width: '16px', height: '16px', marginRight: '6px', objectFit: 'contain' }} />}
              <span style={{ fontWeight: winner?.id === team2?.id ? 'bold' : 'normal' }}>{team2.name}</span>
            </>
          ) : <span style={{color:'gray', marginLeft: '20px'}}>TBD</span>}
        </button>
      </div>
    );
  };

  const renderRegion = (regionName) => {
    const rounds = [8, 4, 2, 1]; // number of matches per round
    return (
      <div key={regionName} style={{ marginBottom: '3rem' }}>
        <h3 style={{ borderBottom: '2px solid var(--brand-red)', paddingBottom: '0.5rem', marginBottom: '1rem' }}>{regionName} Region</h3>
        <div style={{ display: 'flex', gap: '2rem', overflowX: 'auto' }}>
          {rounds.map((matchCount, roundIdx) => (
            <div key={roundIdx} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-around' }}>
              <div style={{ fontSize: '0.8rem', color: 'gray', marginBottom: '0.5rem', textAlign: 'center' }}>
                {roundIdx === 0 ? 'Round of 64' : roundIdx === 1 ? 'Round of 32' : roundIdx === 2 ? 'Sweet 16' : 'Elite 8'}
              </div>
              {Array.from({ length: matchCount }).map((_, matchIdx) => {
                const teams = getMatchupTeams(regionName, roundIdx, matchIdx);
                const key = `${regionName}_${roundIdx}_${matchIdx}`;
                return renderMatchup(key, teams[0], teams[1]);
              })}
            </div>
          ))}
        </div>
      </div>
    );
  };

  const submitBracket = () => {
    // Check if bracket is complete
    if (!picks['champ_0']) {
      alert("Please select a National Champion before submitting!");
      return;
    }
    alert("Bracket submitted successfully! Your picks are locked in for the tournament.");
    setBracketState('welcome');
  };

  if (!currentUser) return <div className="page-container">Loading...</div>;

  // Final 4 Logic
  const eastWinner = picks['East_3_0'];
  const westWinner = picks['West_3_0'];
  const southWinner = picks['South_3_0'];
  const midwestWinner = picks['Midwest_3_0'];

  return (
    <div className="page-container" style={{ maxWidth: '1200px' }}>
      <div className="feed-header">
        <h1>🏀 March Madness Bracket Challenge</h1>
      </div>

      {bracketState === 'welcome' && (
        <div className="post-card" style={{ padding: '2rem', textAlign: 'center' }}>
          <h2>Welcome to the Bracket Challenge!</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>
            Compete against your friends, predict the upsets, and prove your college basketball knowledge.
          </p>
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
            <button className="btn-primary" onClick={() => setBracketState('picks')}>
              Fill Out My Bracket
            </button>
            <button className="btn-secondary" onClick={() => setBracketState('create')}>
              Create Private League
            </button>
          </div>
        </div>
      )}

      {bracketState === 'create' && (
        <div className="post-card" style={{ padding: '2rem' }}>
          <h2>Create a Private League</h2>
          <div style={{ marginTop: '1rem' }}>
            <input 
              type="text" 
              placeholder="League Name" 
              className="search-input" 
              value={leagueName} 
              onChange={e => setLeagueName(e.target.value)} 
              style={{ width: '100%', marginBottom: '1rem' }} 
            />
            <button className="btn-primary" onClick={() => {
              alert(`League "${leagueName}" created successfully! Invite code: MM-2026-X`);
              setBracketState('welcome');
            }}>
              Create League
            </button>
            <button className="btn-secondary" onClick={() => setBracketState('welcome')} style={{ marginLeft: '1rem' }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {bracketState === 'picks' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2>Make Your Picks</h2>
            <button className="btn-primary" onClick={submitBracket}>Submit Bracket</button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '3rem' }}>
            {['East', 'West', 'South', 'Midwest'].map(region => renderRegion(region))}
          </div>

          <div style={{ borderTop: '2px solid var(--border)', paddingTop: '2rem' }}>
            <h2 style={{ textAlign: 'center', marginBottom: '2rem' }}>Final Four & Championship</h2>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '4rem', alignItems: 'center' }}>
              
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <div style={{ fontSize: '0.8rem', color: 'gray', marginBottom: '0.5rem', textAlign: 'center' }}>Final Four</div>
                {renderMatchup('final4_0', eastWinner, westWinner)}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <div style={{ fontSize: '0.8rem', color: 'gray', marginBottom: '0.5rem', textAlign: 'center' }}>National Championship</div>
                {renderMatchup('champ_0', picks['final4_0'], picks['final4_1'])}
                
                {picks['champ_0'] && (
                  <div style={{ textAlign: 'center', marginTop: '1rem', padding: '1rem', background: 'var(--brand-red)', color: 'white', borderRadius: '8px' }}>
                    <h3 style={{ margin: 0, fontSize: '0.9rem' }}>NATIONAL CHAMPION</h3>
                    <h2 style={{ margin: '0.5rem 0 0' }}>🏆 {picks['champ_0'].name} 🏆</h2>
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <div style={{ fontSize: '0.8rem', color: 'gray', marginBottom: '0.5rem', textAlign: 'center' }}>Final Four</div>
                {renderMatchup('final4_1', southWinner, midwestWinner)}
              </div>

            </div>
          </div>
        </div>
      )}

    </div>
  );
}
