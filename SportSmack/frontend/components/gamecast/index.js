"use client";
import React from 'react';

export function Timeline({ timelineData, winProbability }) {
  if (!timelineData || timelineData.length === 0) {
    return <div className="gamecast-timeline">Waiting for game events...</div>;
  }

  return (
    <div className="gamecast-timeline" style={{ background: 'var(--glass-bg)', padding: '1rem', borderRadius: '12px', border: '1px solid var(--glass-border)', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <h3 style={{ margin: 0, paddingBottom: '0.5rem', borderBottom: '1px solid var(--glass-border)' }}>Live Timeline</h3>
      
      {winProbability && winProbability.length > 0 && (
        <div className="win-probability" style={{ fontSize: '0.9rem', marginBottom: '1rem' }}>
          <strong>Latest Win Probability:</strong> 
          Home {winProbability[winProbability.length - 1].homeWinPercentage * 100}% | 
          Away {100 - (winProbability[winProbability.length - 1].homeWinPercentage * 100)}%
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', maxHeight: '400px', overflowY: 'auto' }}>
        {timelineData.map(event => (
          <div key={event.id} style={{ display: 'flex', gap: '1rem', padding: '0.8rem', background: 'rgba(255,255,255,0.05)', borderRadius: '8px' }}>
            <div style={{ minWidth: '60px', fontWeight: 'bold', color: 'var(--primary-color)' }}>
              {event.time}
            </div>
            <div>
              <div style={{ fontWeight: 'bold' }}>{event.title}</div>
              <div style={{ fontSize: '0.9rem', opacity: 0.9 }}>{event.text}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function LiveStats({ statsData }) {
  const [view, setView] = React.useState('team'); // 'team' or 'players'

  if (!statsData) return <div>Loading stats...</div>;

  return (
    <div className="gamecast-stats" style={{ background: 'var(--glass-bg)', padding: '1rem', borderRadius: '12px', border: '1px solid var(--glass-border)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid var(--glass-border)', paddingBottom: '0.5rem' }}>
        <h3 style={{ margin: 0 }}>Boxscore</h3>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button onClick={() => setView('team')} className="btn-secondary" style={{ opacity: view === 'team' ? 1 : 0.5 }}>Team</button>
          <button onClick={() => setView('players')} className="btn-secondary" style={{ opacity: view === 'players' ? 1 : 0.5 }}>Players</button>
        </div>
      </div>
      
      {view === 'team' && (
        <div style={{ display: 'flex', gap: '2rem' }}>
          {statsData.competitors && statsData.competitors.map((competitor, index) => {
            const teamInfo = competitor.team;
            const records = statsData.teamRecords?.[teamInfo.id] || {};
            
            // Safe render helper
            const renderVal = (val) => {
              if (val === null || val === undefined) return '-';
              if (typeof val === 'object') return val.displayValue || val.value || '-';
              return val;
            };

            return (
              <div key={index} style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                  {teamInfo.logo && <img src={teamInfo.logo} alt={teamInfo.displayName} style={{ width: '30px', height: '30px', objectFit: 'contain' }} />}
                  <h4 style={{ margin: 0 }}>{teamInfo.displayName}</h4>
                </div>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.95rem', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.3rem' }}>
                    <span style={{ opacity: 0.8 }}>Overall Record</span>
                    <strong>{renderVal(records.wins)}-{renderVal(records.losses)}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.95rem', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.3rem' }}>
                    <span style={{ opacity: 0.8 }}>Win Percentage</span>
                    <strong>{renderVal(records.winPercent)}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.95rem', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.3rem' }}>
                    <span style={{ opacity: 0.8 }}>Home Record</span>
                    <strong>{renderVal(records.homeRecord)}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.95rem', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.3rem' }}>
                    <span style={{ opacity: 0.8 }}>Away Record</span>
                    <strong>{renderVal(records.awayRecord)}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.95rem', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.3rem' }}>
                    <span style={{ opacity: 0.8 }}>Streak</span>
                    <strong>{renderVal(records.streak)}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.95rem', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.3rem' }}>
                    <span style={{ opacity: 0.8 }}>Games Behind</span>
                    <strong>{renderVal(records.gamesBehind)}</strong>
                  </div>
                  {records.group && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.95rem', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.3rem' }}>
                      <span style={{ opacity: 0.8 }}>Division/Conference</span>
                      <strong>{records.group}</strong>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {view === 'players' && statsData.players && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', maxHeight: '500px', overflowY: 'auto' }}>
          {statsData.players.map((teamPlayerStats, teamIdx) => (
            <div key={teamIdx}>
              <h4 style={{ margin: '0 0 1rem 0', color: 'var(--primary-color)' }}>{teamPlayerStats.team?.displayName || teamPlayerStats.team?.abbreviation}</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                {teamPlayerStats.statistics && teamPlayerStats.statistics.map((statCategory, catIdx) => (
                  <div key={catIdx} style={{ background: 'rgba(0,0,0,0.2)', padding: '0.8rem', borderRadius: '8px' }}>
                    <h5 style={{ margin: '0 0 0.5rem 0', textTransform: 'uppercase' }}>{statCategory.names || statCategory.type || 'Stats'}</h5>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.2)', opacity: 0.8 }}>
                          <th style={{ textAlign: 'left', padding: '0.2rem' }}>Player</th>
                          {statCategory.labels && statCategory.labels.map((label, lIdx) => (
                            <th key={lIdx} style={{ textAlign: 'right', padding: '0.2rem' }}>{label}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {statCategory.athletes && statCategory.athletes.map((athleteData, aIdx) => (
                          <tr key={aIdx} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                            <td style={{ padding: '0.4rem 0.2rem', fontWeight: 'bold' }}>{athleteData.athlete?.displayName}</td>
                            {athleteData.stats && athleteData.stats.map((statVal, sIdx) => (
                              <td key={sIdx} style={{ textAlign: 'right', padding: '0.4rem 0.2rem' }}>{statVal}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function DynamicPolls({ pollsData }) {
  if (!pollsData || pollsData.length === 0) return null;

  return (
    <div className="gamecast-polls" style={{ background: 'var(--glass-bg)', padding: '1rem', borderRadius: '12px', border: '1px solid var(--glass-border)', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <h3 style={{ margin: 0, paddingBottom: '0.5rem', borderBottom: '1px solid var(--glass-border)' }}>Live Polls</h3>
      
      {pollsData.map(poll => (
        <div key={poll.id} style={{ background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: '8px' }}>
          <h4 style={{ margin: '0 0 1rem 0' }}>{poll.question}</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {poll.options.map((opt, i) => {
              const totalVotes = poll.options.reduce((sum, o) => sum + o.votes, 0) || 1;
              const percent = Math.round((opt.votes / totalVotes) * 100);
              
              return (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                    <span>{opt.text}</span>
                    <span>{percent}%</span>
                  </div>
                  <div style={{ height: '8px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${percent}%`, background: 'var(--primary-color)' }}></div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

export function LiveAIAnalysis({
  data
}) {
  if (!data?.analysis) {
    return null;
  }

  const analysis =
    data.analysis;

  const advantage =
    analysis.advantage || {};

  return (
    <div
      className="gamecast-live-ai"
      style={{
        background:
          'var(--glass-bg)',
        padding: '1rem',
        borderRadius: '12px',
        border:
          '1px solid var(--glass-border)',
        marginBottom: '1rem'
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent:
            'space-between',
          alignItems: 'center',
          marginBottom: '0.75rem'
        }}
      >
        <h3
          style={{
            margin: 0
          }}
        >
          🔴 Live AI Analysis
        </h3>

        <span
          style={{
            fontSize: '0.75rem',
            opacity: 0.7
          }}
        >
          Updated{' '}
          {new Date(
            data.generatedAt
          ).toLocaleTimeString()}
        </span>
      </div>

      <h4
        style={{
          margin:
            '0 0 0.5rem 0'
        }}
      >
        {analysis.headline}
      </h4>

      <p
        style={{
          lineHeight: 1.5,
          margin:
            '0 0 1rem 0'
        }}
      >
        {analysis.update}
      </p>

      {advantage.team && (
        <div
          style={{
            padding:
              '0.75rem',
            background:
              'rgba(255,255,255,0.05)',
            borderRadius: '8px',
            marginBottom:
              '0.75rem'
          }}
        >
          <strong>
            Current Advantage:{' '}
          </strong>

          {advantage.team}

          <div
            style={{
              marginTop:
                '0.35rem',
              fontSize:
                '0.85rem',
              opacity: 0.85
            }}
          >
            {advantage.reason}
          </div>

          <div
            style={{
              marginTop:
                '0.35rem',
              fontSize:
                '0.8rem'
            }}
          >
            Confidence:{' '}
            {advantage.confidence}%
          </div>
        </div>
      )}

      {analysis.keyDevelopment && (
        <div
          style={{
            marginBottom:
              '0.75rem'
          }}
        >
          <strong>
            {analysis.keyDevelopment.title}
          </strong>

          <p
            style={{
              margin:
                '0.25rem 0',
              lineHeight: 1.5
            }}
          >
            {
              analysis
                .keyDevelopment
                .explanation
            }
          </p>
        </div>
      )}

      {analysis.momentum && (
        <div
          style={{
            marginBottom:
              '0.75rem'
          }}
        >
          <strong>
            Momentum:{' '}
            {analysis.momentum.team}
          </strong>

          <p
            style={{
              margin:
                '0.25rem 0',
              lineHeight: 1.5
            }}
          >
            {
              analysis
                .momentum
                .explanation
            }
          </p>
        </div>
      )}

      {Array.isArray(
        analysis.watchNext
      ) &&
        analysis.watchNext.length >
          0 && (
          <div>
            <strong>
              Watch Next
            </strong>

            <ul
              style={{
                margin:
                  '0.4rem 0 0 1.2rem',
                padding: 0
              }}
            >
              {analysis.watchNext.map(
                (item, index) => (
                  <li
                    key={index}
                    style={{
                      marginBottom:
                        '0.3rem'
                    }}
                  >
                    {item}
                  </li>
                )
              )}
            </ul>
          </div>
        )}
    </div>
  );
}

export function PregameAnalysis({ data, loading, error }) {
    if (loading) {
        return (
            <div
                className="gamecast-analysis"
                style={{
                    background: 'var(--glass-bg)',
                    padding: '1.5rem',
                    borderRadius: '12px',
                    border: '1px solid var(--glass-border)',
                    marginBottom: '1rem'
                }}
            >
                <h3 style={{ marginTop: 0 }}>
                    AI Pre-Game Analysis
                </h3>

                <p style={{ opacity: 0.75 }}>
                    Analyzing this matchup...
                </p>
            </div>
        );
    }

    if (error) {
        return (
            <div
                className="gamecast-analysis"
                style={{
                    background: 'var(--glass-bg)',
                    padding: '1.5rem',
                    borderRadius: '12px',
                    border: '1px solid var(--glass-border)',
                    marginBottom: '1rem'
                }}
            >
                <h3 style={{ marginTop: 0 }}>
                    AI Pre-Game Analysis
                </h3>

                <p style={{ opacity: 0.75 }}>
                    Pre-game analysis is temporarily unavailable.
                </p>
            </div>
        );
    }

    if (!data?.analysis) {
        return null;
    }

    const analysis = data.analysis;

    const home =
        data.matchup?.home || {};
    
    const away =
        data.matchup?.away || {};
    
    const formatRecord = (standing) => {
        if (!standing) return 'Unavailable';
    
        const wins =
            standing.wins ??
            standing.record?.wins ??
            '-';
    
        const losses =
            standing.losses ??
            standing.record?.losses ??
            '-';
    
        return `${wins}-${losses}`;
    };
    
    const recentRecord = (form) => {
        if (!form) return 'Unavailable';
    
        return `${form.wins || 0}-${form.losses || 0}-${form.ties || 0}`;
    };

    return (
        <div
            className="gamecast-analysis"
            style={{
                background: 'var(--glass-bg)',
                padding: '1.5rem',
                borderRadius: '12px',
                border: '1px solid var(--glass-border)',
                marginBottom: '1rem'
            }}
        >
            <div
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: '1rem',
                    alignItems: 'flex-start',
                    marginBottom: '1rem'
                }}
            >
                <div>
                    <h3 style={{ margin: 0 }}>
                        AI Pre-Game Analysis
                    </h3>

                    {analysis.headline && (
                        <div
                            style={{
                                marginTop: '0.4rem',
                                fontWeight: 'bold',
                                color: 'var(--primary-color)'
                            }}
                        >
                            {analysis.headline}
                        </div>
                    )}
                </div>

                {analysis.prediction?.winner && (
                    <div
                        style={{
                            padding: '0.6rem 0.8rem',
                            borderRadius: '8px',
                            background: 'rgba(255,255,255,0.06)',
                            textAlign: 'center',
                            minWidth: '120px'
                        }}
                    >
                        <div
                            style={{
                                fontSize: '0.7rem',
                                opacity: 0.7,
                                textTransform: 'uppercase'
                            }}
                        >
                            AI Pick
                        </div>

                        <strong>
                            {analysis.prediction.winner}
                        </strong>

                        {analysis.prediction.confidence !== undefined && (
                            <div
                                style={{
                                    fontSize: '0.8rem',
                                    opacity: 0.75
                                }}
                            >
                                {analysis.prediction.confidence}% confidence
                            </div>
                        )}
                    </div>
                )}
            </div>

            {analysis.summary && (
                <p
                    style={{
                        lineHeight: 1.55,
                        marginTop: 0
                    }}
                >
                    {analysis.summary}
                </p>
            )}

            <div
              style={{
                  marginTop: '1.2rem',
                  padding: '1rem',
                  background: 'rgba(255,255,255,0.04)',
                  borderRadius: '8px'
              }}
          >
              <h4 style={{ marginTop: 0 }}>
                  Matchup Context
              </h4>
          
              <div
                  style={{
                      display: 'grid',
                      gridTemplateColumns:
                          'repeat(auto-fit, minmax(220px, 1fr))',
                      gap: '1rem'
                  }}
              >
                  <div>
                      <strong>{home.name || 'Home Team'}</strong>
          
                      <p style={{ margin: '0.5rem 0' }}>
                          Record:{' '}
                          {formatRecord(home.standings)}
                      </p>
          
                      <p style={{ margin: '0.5rem 0' }}>
                          Last 5:{' '}
                          {recentRecord(home.recentForm)}
                      </p>
          
                      <p style={{ margin: '0.5rem 0' }}>
                          Point differential:{' '}
                          {home.recentForm?.pointDifferential ??
                              'Unavailable'}
                      </p>
                  </div>
          
                  <div>
                      <strong>{away.name || 'Away Team'}</strong>
          
                      <p style={{ margin: '0.5rem 0' }}>
                          Record:{' '}
                          {formatRecord(away.standings)}
                      </p>
          
                      <p style={{ margin: '0.5rem 0' }}>
                          Last 5:{' '}
                          {recentRecord(away.recentForm)}
                      </p>
          
                      <p style={{ margin: '0.5rem 0' }}>
                          Point differential:{' '}
                          {away.recentForm?.pointDifferential ??
                              'Unavailable'}
                      </p>
                  </div>
              </div>
          </div>

            {analysis.keyMatchup && (
                <div
                    style={{
                        marginTop: '1.2rem',
                        padding: '1rem',
                        background: 'rgba(255,255,255,0.04)',
                        borderRadius: '8px'
                    }}
                >
                    <h4 style={{ marginTop: 0 }}>
                        Key Matchup
                    </h4>

                    <strong>
                        {analysis.keyMatchup.title}
                    </strong>

                    <p style={{ lineHeight: 1.5 }}>
                        {analysis.keyMatchup.analysis}
                    </p>

                    {analysis.keyMatchup.evidence?.length > 0 && (
                        <ul
                            style={{
                                marginBottom: 0,
                                paddingLeft: '1.2rem'
                            }}
                        >
                            {analysis.keyMatchup.evidence.map(
                                (item, index) => (
                                    <li key={index}>{item}</li>
                                )
                            )}
                        </ul>
                    )}
                </div>
            )}

            {analysis.offensiveComparison && (
              <div style={{ marginTop: '1rem' }}>
                  <h4>Offensive Comparison</h4>
          
                  <p style={{ lineHeight: 1.5 }}>
                      {analysis.offensiveComparison.analysis}
                  </p>
          
                  <strong>
                      Advantage:{' '}
                      {analysis.offensiveComparison.advantage ||
                          'Unavailable'}
                  </strong>
              </div>
          )}
          
          {analysis.defensiveComparison && (
              <div style={{ marginTop: '1rem' }}>
                  <h4>Defensive Comparison</h4>
          
                  <p style={{ lineHeight: 1.5 }}>
                      {analysis.defensiveComparison.analysis}
                  </p>
          
                  <strong>
                      Advantage:{' '}
                      {analysis.defensiveComparison.advantage ||
                          'Unavailable'}
                  </strong>
              </div>
          )}

          {analysis.keyPlayers && (
            <div style={{ marginTop: '1rem' }}>
                <h4>Key Players</h4>
        
                <div
                    style={{
                        display: 'grid',
                        gridTemplateColumns:
                            'repeat(auto-fit, minmax(220px, 1fr))',
                        gap: '1rem'
                    }}
                >
                    <div>
                        <strong>
                            {home.name || 'Home'}
                        </strong>
        
                        <ul style={{ paddingLeft: '1.2rem' }}>
                            {(analysis.keyPlayers.home || []).map(
                                (item, index) => (
                                    <li key={index}>{item}</li>
                                )
                            )}
                        </ul>
                    </div>
        
                    <div>
                        <strong>
                            {away.name || 'Away'}
                        </strong>
        
                        <ul style={{ paddingLeft: '1.2rem' }}>
                            {(analysis.keyPlayers.away || []).map(
                                (item, index) => (
                                    <li key={index}>{item}</li>
                                )
                            )}
                        </ul>
                    </div>
                </div>
            </div>
        )}
        
        {analysis.injuries && (
            <div style={{ marginTop: '1rem' }}>
                <h4>Injury Impact</h4>
        
                <p style={{ lineHeight: 1.5 }}>
                    {analysis.injuries.analysis}
                </p>
        
                <ul style={{ paddingLeft: '1.2rem' }}>
                    {(analysis.injuries.important || []).map(
                        (item, index) => (
                            <li key={index}>{item}</li>
                        )
                    )}
                </ul>
            </div>
        )}
        
        {analysis.news && (
            <div style={{ marginTop: '1rem' }}>
                <h4>Relevant Team News</h4>
        
                <p style={{ lineHeight: 1.5 }}>
                    {analysis.news.analysis}
                </p>
        
                <ul style={{ paddingLeft: '1.2rem' }}>
                    {(analysis.news.important || []).map(
                        (item, index) => (
                            <li key={index}>{item}</li>
                        )
                    )}
                </ul>
            </div>
        )}
              
            <div
                style={{
                    display: 'grid',
                    gridTemplateColumns:
                        'repeat(auto-fit, minmax(220px, 1fr))',
                    gap: '1rem',
                    marginTop: '1rem'
                }}
            >
                {analysis.homeTeam && (
                    <div
                        style={{
                            padding: '1rem',
                            background: 'rgba(255,255,255,0.04)',
                            borderRadius: '8px'
                        }}
                    >
                        <h4 style={{ marginTop: 0 }}>
                            {analysis.homeTeam.name}
                        </h4>

                        <strong>Advantages</strong>

                        <ul style={{ paddingLeft: '1.2rem' }}>
                            {(analysis.homeTeam.advantages || []).map(
                                (item, index) => (
                                    <li key={index}>{item}</li>
                                )
                            )}
                        </ul>

                        <strong>Concerns</strong>

                        <ul style={{ paddingLeft: '1.2rem' }}>
                            {(analysis.homeTeam.concerns || []).map(
                                (item, index) => (
                                    <li key={index}>{item}</li>
                                )
                            )}
                        </ul>
                    </div>
                )}

                {analysis.awayTeam && (
                    <div
                        style={{
                            padding: '1rem',
                            background: 'rgba(255,255,255,0.04)',
                            borderRadius: '8px'
                        }}
                    >
                        <h4 style={{ marginTop: 0 }}>
                            {analysis.awayTeam.name}
                        </h4>

                        <strong>Advantages</strong>

                        <ul style={{ paddingLeft: '1.2rem' }}>
                            {(analysis.awayTeam.advantages || []).map(
                                (item, index) => (
                                    <li key={index}>{item}</li>
                                )
                            )}
                        </ul>

                        <strong>Concerns</strong>

                        <ul style={{ paddingLeft: '1.2rem' }}>
                            {(analysis.awayTeam.concerns || []).map(
                                (item, index) => (
                                    <li key={index}>{item}</li>
                                )
                            )}
                        </ul>
                    </div>
                )}
            </div>

            {analysis.reasoning?.primaryEvidence?.length > 0 && (
              <div
                  style={{
                      marginTop: '1rem',
                      padding: '1rem',
                      background: 'rgba(255,255,255,0.04)',
                      borderRadius: '8px'
                  }}
              >
                  <h4 style={{ marginTop: 0 }}>
                      Why the AI Thinks This
                  </h4>
          
                  <div
                      style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '0.8rem'
                      }}
                  >
                      {analysis.reasoning.primaryEvidence.map(
                          (item, index) => (
                              <div
                                  key={index}
                                  style={{
                                      padding: '0.8rem',
                                      background:
                                          'rgba(255,255,255,0.03)',
                                      borderRadius: '6px'
                                  }}
                              >
                                  <strong>
                                      {item.factor}
                                  </strong>
          
                                  {item.team && (
                                      <div
                                          style={{
                                              fontSize: '0.8rem',
                                              opacity: 0.7,
                                              marginTop: '0.2rem'
                                          }}
                                      >
                                          {item.team}
                                      </div>
                                  )}
          
                                  <p
                                      style={{
                                          margin:
                                              '0.4rem 0',
                                          lineHeight: 1.5
                                      }}
                                  >
                                      {item.evidence}
                                  </p>
          
                                  {item.impact && (
                                      <p
                                          style={{
                                              margin: 0,
                                              lineHeight: 1.5,
                                              opacity: 0.85
                                          }}
                                      >
                                          <strong>
                                              Impact:
                                          </strong>{' '}
                                          {item.impact}
                                      </p>
                                  )}
                              </div>
                          )
                      )}
                  </div>
              </div>
          )}
          
          {analysis.reasoning?.counterEvidence?.length > 0 && (
              <div
                  style={{
                      marginTop: '1rem',
                      padding: '1rem',
                      background: 'rgba(255,255,255,0.04)',
                      borderRadius: '8px'
                  }}
              >
                  <h4 style={{ marginTop: 0 }}>
                      Evidence Against the Pick
                  </h4>
          
                  <div
                      style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '0.8rem'
                      }}
                  >
                      {analysis.reasoning.counterEvidence.map(
                          (item, index) => (
                              <div
                                  key={index}
                                  style={{
                                      padding: '0.8rem',
                                      background:
                                          'rgba(255,255,255,0.03)',
                                      borderRadius: '6px'
                                  }}
                              >
                                  <strong>
                                      {item.factor}
                                  </strong>
          
                                  {item.team && (
                                      <div
                                          style={{
                                              fontSize: '0.8rem',
                                              opacity: 0.7,
                                              marginTop: '0.2rem'
                                          }}
                                      >
                                          {item.team}
                                      </div>
                                  )}
          
                                  <p
                                      style={{
                                          margin:
                                              '0.4rem 0',
                                          lineHeight: 1.5
                                      }}
                                  >
                                      {item.evidence}
                                  </p>
          
                                  {item.impact && (
                                      <p
                                          style={{
                                              margin: 0,
                                              lineHeight: 1.5,
                                              opacity: 0.85
                                          }}
                                      >
                                          <strong>
                                              Why It Matters:
                                          </strong>{' '}
                                          {item.impact}
                                      </p>
                                  )}
                              </div>
                          )
                      )}
                  </div>
              </div>
          )}

            {analysis.mostImportantFactor && (
                <div style={{ marginTop: '1rem' }}>
                    <h4>Most Important Factor</h4>
                    <p style={{ lineHeight: 1.5 }}>
                        {analysis.mostImportantFactor}
                    </p>
                </div>
            )}

            {analysis.prediction?.reason && (
                <div style={{ marginTop: '1rem' }}>
                    <h4>Why the AI Picked Them</h4>
                    <p style={{ lineHeight: 1.5 }}>
                        {analysis.prediction.reason}
                    </p>
                </div>
            )}

            {analysis.watchFor?.length > 0 && (
                <div style={{ marginTop: '1rem' }}>
                    <h4>What to Watch For</h4>

                    <ul style={{ paddingLeft: '1.2rem' }}>
                        {analysis.watchFor.map((item, index) => (
                            <li key={index}>{item}</li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
}

export function PostGameAnalysis({ data }) {
  if (!data?.analysis) {
    return null;
  }

  const analysis = data.analysis;

  return (
    <div
      style={{
        background: 'var(--glass-bg)',
        padding: '1rem',
        borderRadius: '12px',
        border:
          '1px solid var(--glass-border)',
        marginBottom: '1rem'
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '0.75rem'
        }}
      >
        <h3 style={{ margin: 0 }}>
          🏁 Post-Game AI Analysis
        </h3>

        <span
          style={{
            fontSize: '0.75rem',
            opacity: 0.7
          }}
        >
          Final
        </span>
      </div>

      <h4 style={{ margin: '0 0 0.5rem' }}>
        {analysis.headline}
      </h4>

      <p style={{ lineHeight: 1.5 }}>
        {analysis.summary}
      </p>

      {analysis.winner && (
        <div
          style={{
            padding: '0.8rem',
            marginBottom: '0.75rem',
            background:
              'rgba(255,255,255,0.05)',
            borderRadius: '8px'
          }}
        >
          <strong>
            Why {analysis.winner.team} Won
          </strong>

          <p
            style={{
              margin: '0.4rem 0 0',
              lineHeight: 1.5
            }}
          >
            {analysis.winner.whyTheyWon}
          </p>
        </div>
      )}

      {analysis.loser && (
        <div
          style={{
            padding: '0.8rem',
            marginBottom: '0.75rem',
            background:
              'rgba(255,255,255,0.05)',
            borderRadius: '8px'
          }}
        >
          <strong>
            Why {analysis.loser.team} Lost
          </strong>

          <p
            style={{
              margin: '0.4rem 0 0',
              lineHeight: 1.5
            }}
          >
            {analysis.loser.whyTheyLost}
          </p>
        </div>
      )}

      {analysis.turningPoint && (
        <div
          style={{
            marginBottom: '0.75rem'
          }}
        >
          <strong>
            {analysis.turningPoint.title}
          </strong>

          <p
            style={{
              margin: '0.3rem 0',
              lineHeight: 1.5
            }}
          >
            {analysis.turningPoint.explanation}
          </p>
        </div>
      )}

      {Array.isArray(
        analysis.keyPlayers
      ) &&
        analysis.keyPlayers.length > 0 && (
          <div
            style={{
              marginBottom: '0.75rem'
            }}
          >
            <strong>
              Key Players
            </strong>

            <ul
              style={{
                paddingLeft: '1.2rem'
              }}
            >
              {analysis.keyPlayers.map(
                (player, index) => (
                  <li key={index}>
                    <strong>
                      {player.name}
                    </strong>{' '}
                    ({player.team}) —{' '}
                    {player.impact}
                  </li>
                )
              )}
            </ul>
          </div>
        )}

      {analysis.preGamePrediction && (
        <div
          style={{
            padding: '0.8rem',
            marginBottom: '0.75rem',
            background:
              'rgba(255,255,255,0.05)',
            borderRadius: '8px'
          }}
        >
          <strong>
            Pre-Game Prediction
          </strong>

          <p
            style={{
              margin: '0.4rem 0',
              lineHeight: 1.5
            }}
          >
            Predicted:{' '}
            {analysis.preGamePrediction.prediction}
            <br />
            Actual winner:{' '}
            {analysis.preGamePrediction.actualWinner}
            <br />
            Result:{' '}
            {analysis.preGamePrediction.correct
              ? '✅ Correct'
              : '❌ Incorrect'}
          </p>

          <p
            style={{
              margin: 0,
              lineHeight: 1.5
            }}
          >
            {analysis.preGamePrediction.analysis}
          </p>
        </div>
      )}

      {analysis.biggestTakeaway && (
        <div>
          <strong>
            Biggest Takeaway
          </strong>

          <p
            style={{
              margin: '0.3rem 0',
              lineHeight: 1.5
            }}
          >
            {analysis.biggestTakeaway}
          </p>
        </div>
      )}
    </div>
  );
}
