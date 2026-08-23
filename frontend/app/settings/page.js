'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useRouter } from 'next/navigation';

export default function SettingsPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [profilePic, setProfilePic] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
    if (user) {
      setProfilePic(user.profile_pic || '');
    }
  }, [user, authLoading, router]);

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setProfilePic(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (password && password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setSaving(true);

    try {
      const payload = {};
      if (profilePic !== user.profile_pic) payload.profile_pic = profilePic;
      if (password) payload.password = password;

      if (Object.keys(payload).length === 0) {
        setSaving(false);
        return;
      }

      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'}/api/users/me`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        setSuccess("Profile updated successfully! Refresh to see changes globally.");
        setPassword('');
        setConfirmPassword('');
      } else {
        const data = await res.json();
        setError(data.message || "Failed to update profile");
      }
    } catch (err) {
      setError("An unexpected error occurred.");
    } finally {
      setSaving(false);
    }
  };

  if (authLoading || !user) return <div className="page-container">Loading...</div>;

  return (
    <div className="page-container auth-container" style={{ alignItems: 'flex-start', paddingTop: '4rem' }}>
      <div className="auth-box" style={{ maxWidth: '600px' }}>
        <h1 className="auth-title">Account Settings</h1>
        
        {error && <div className="auth-error">{error}</div>}
        {success && <div style={{ backgroundColor: '#dcfce7', color: '#166534', padding: '0.75rem', borderRadius: '8px', marginBottom: '1rem', textAlign: 'center' }}>{success}</div>}

        <form onSubmit={handleSave} className="auth-form">
          <div className="form-group">
            <label>Profile Picture URL</label>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
              <div style={{ width: '60px', height: '60px', borderRadius: '50%', backgroundColor: 'var(--border-color)', overflow: 'hidden', flexShrink: 0 }}>
                {profilePic ? (
                  <img src={profilePic} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', fontWeight: 'bold' }}>
                    {user.username.charAt(0).toUpperCase()}
                  </div>
                )}
              </div>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <input 
                  type="file" 
                  accept="image/*"
                  onChange={handleFileChange}
                  style={{ display: 'block', width: '100%', fontSize: '0.9rem' }}
                />
                <input 
                  type="url" 
                  value={profilePic} 
                  onChange={(e) => setProfilePic(e.target.value)} 
                  placeholder="Or paste an image URL..."
                  style={{ width: '100%' }}
                />
              </div>
            </div>
          </div>

          <div style={{ margin: '1rem 0', borderBottom: '1px solid var(--border-color)' }}></div>

          <h3 style={{ marginBottom: '0.5rem' }}>Change Password</h3>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>Leave blank if you do not wish to change your password.</p>

          <div className="form-group">
            <label>New Password</label>
            <input 
              type="password" 
              value={password} 
              onChange={(e) => setPassword(e.target.value)} 
              placeholder="New secure password"
            />
          </div>

          <div className="form-group">
            <label>Confirm New Password</label>
            <input 
              type="password" 
              value={confirmPassword} 
              onChange={(e) => setConfirmPassword(e.target.value)} 
              placeholder="Confirm new password"
            />
          </div>

          <button type="submit" className="auth-button" disabled={saving} style={{ marginTop: '1rem' }}>
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </form>
      </div>
    </div>
  );
}
