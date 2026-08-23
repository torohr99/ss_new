'use client';

import Link from 'next/link';

export default function SportsHubs() {
  return (
    <div className="page-container" style={{ maxWidth: '1200px' }}>
      <div className="feed-header">
        <h1>🏆 Sports Hubs</h1>
        <p style={{ color: 'var(--text-secondary)' }}>Welcome to the Sports Hub. Select an experience below.</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '2rem', marginTop: '2rem' }}>
        
        {/* Fantasy Football Tile */}
        <div className="post-card" style={{ display: 'flex', flexDirection: 'column', padding: '2rem', textAlign: 'center', background: 'linear-gradient(135deg, rgba(30,58,138,0.2), rgba(0,0,0,0.5))', border: '1px solid rgba(59,130,246,0.3)' }}>
          <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>🏈</div>
          <h2>Fantasy Football</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem', flex: 1 }}>
            Draft your dream team, manage your roster, and compete in weekly matchups against your friends in the ultimate NFL fantasy experience.
          </p>
          <Link href="/fantasy" className="btn-primary" style={{ width: '100%', textDecoration: 'none' }}>
            Enter Fantasy Hub
          </Link>
        </div>

        {/* March Madness Tile */}
        <div className="post-card" style={{ display: 'flex', flexDirection: 'column', padding: '2rem', textAlign: 'center', background: 'linear-gradient(135deg, rgba(153,27,27,0.2), rgba(0,0,0,0.5))', border: '1px solid rgba(239,68,68,0.3)' }}>
          <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>🏀</div>
          <h2>March Madness Bracket</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem', flex: 1 }}>
            Create custom bracket leagues, invite your friends, and make your picks for the NCAA Men's and Women's Basketball tournaments.
          </p>
          <Link href="/hubs/brackets" className="btn-primary" style={{ width: '100%', textDecoration: 'none', background: 'var(--brand-red)' }}>
            Enter Bracket Challenge
          </Link>
        </div>

      </div>
    </div>
  );
}
