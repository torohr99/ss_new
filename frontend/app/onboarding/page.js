'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../context/AuthContext';

export default function Onboarding() {
  const [teams, setTeams] = useState([]);
  const [selectedTeams, setSelectedTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const router = useRouter();
  const { user } = useAuth();

  useEffect(() => {
    // If not logged in, they shouldn't be here
    if (user === null && !loading) {
      router.push('/login');
    }
  }, [user, loading, router]);

  useEffect(() => {
    const fetchTeams = async () => {
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'}/api/teams`, {
          credentials: 'include'
        });
        if (res.ok) {
          setTeams(await res.json());
        }
      } catch (err) {
        console.error('Failed to fetch teams', err);
      } finally {
        setLoading(false);
      }
    };

    fetchTeams();
  }, []);

  const toggleTeam = (teamId) => {
    if (selectedTeams.includes(teamId)) {
      setSelectedTeams(selectedTeams.filter(id => id !== teamId));
    } else {
      setSelectedTeams([...selectedTeams, teamId]);
    }
  };

  const handleContinue = async () => {
    setSaving(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'}/api/users/me/teams`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ teamIds: selectedTeams }),
        credentials: 'include'
      });

      if (res.ok) {
        router.push('/');
      } else {
        alert('Failed to save selections. Please try again.');
        setSaving(false);
      }
    } catch (err) {
      console.error(err);
      alert('Network error.');
      setSaving(false);
    }
  };

  if (loading) return <div className="onboarding-container">Loading teams...</div>;

  return (
    <div className="onboarding-container">
      <h1 className="page-title" style={{ fontSize: '3rem', marginBottom: '1rem' }}>Pick your squads</h1>
      <p className="onboarding-subtitle">Select the teams you want to follow. You can always change this later.</p>

      <div className="teams-grid">
        {teams.map(team => {
          const isSelected = selectedTeams.includes(team.id);
          // Determine fallback initials
          const initials = team.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
          
          return (
            <div 
              key={team.id} 
              className={`team-card ${isSelected ? 'selected' : ''}`}
              onClick={() => toggleTeam(team.id)}
            >
              {team.logo_url && !team.logo_url.includes('placeholder.com') ? (
                <img 
                  src={team.logo_url} 
                  alt={`${team.name} logo`} 
                  className="team-logo"
                  onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }}
                />
              ) : null}
              <div 
                className="team-logo-fallback" 
                style={{ 
                  display: (!team.logo_url || team.logo_url.includes('placeholder.com')) ? 'flex' : 'none',
                  width: '60px', height: '60px', borderRadius: '50%', 
                  background: 'linear-gradient(135deg, var(--accent-color), #ff8800)',
                  alignItems: 'center', justifyContent: 'center',
                  color: 'white', fontWeight: 'bold', fontSize: '1.2rem', margin: '0 auto 1rem'
                }}
              >
                {initials}
              </div>
              <div className="team-city">{team.city}</div>
              <div className="team-name">{team.name}</div>
            </div>
          );
        })}
      </div>

      <div className="sticky-footer">
        <button 
          className="btn btn-primary" 
          style={{ fontSize: '1.25rem', padding: '1rem 3rem' }}
          onClick={handleContinue}
          disabled={saving}
        >
          {saving ? 'Saving...' : `Continue (${selectedTeams.length} selected)`}
        </button>
      </div>
    </div>
  );
}
