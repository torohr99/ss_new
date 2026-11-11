'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useRouter } from 'next/navigation';

const API_URL =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

async function uploadProfileImage(file) {
  const authorization = await fetch(`${API_URL}/api/media/upload-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      purpose: 'profile',
      contentType: file.type
    })
  });

  const authorizationData = await authorization.json().catch(() => ({}));
  if (!authorization.ok) {
    throw new Error(
      authorizationData.message || 'Unable to authorize profile image upload.'
    );
  }

  const uploaded = await fetch(authorizationData.uploadUrl, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${authorizationData.token}`,
      'Content-Type': file.type
    },
    body: file
  });

  const uploadData = await uploaded.json().catch(() => ({}));
  if (!uploaded.ok) {
    throw new Error(uploadData.message || 'Profile image upload failed.');
  }

  return uploadData.imageUrl;
}

export default function SettingsPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [profilePic, setProfilePic] = useState('');
  const [profileFile, setProfileFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) router.push('/login');
    if (user) setProfilePic(user.profile_pic || '');
  }, [user, authLoading, router]);

  useEffect(() => {
    if (!profileFile) {
      setPreviewUrl('');
      return undefined;
    }

    const objectUrl = URL.createObjectURL(profileFile);
    setPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [profileFile]);

  const handleFileChange = event => {
    const file = event.target.files?.[0] || null;

    if (!file) {
      setProfileFile(null);
      return;
    }

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Choose a JPEG, PNG, or WebP image.');
      event.target.value = '';
      setProfileFile(null);
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError('Images must be 5 MB or smaller.');
      event.target.value = '';
      setProfileFile(null);
      return;
    }

    setError('');
    setSuccess('');
    setProfileFile(file);
  };

  const handleSave = async event => {
    event.preventDefault();
    setError('');
    setSuccess('');

    if (password && password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setSaving(true);

    try {
      const payload = {};

      if (profileFile) {
        payload.profile_pic = await uploadProfileImage(profileFile);
      }

      if (password) payload.password = password;

      if (Object.keys(payload).length === 0) {
        setSaving(false);
        return;
      }

      const response = await fetch(`${API_URL}/api/users/me`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload)
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.message || 'Failed to update profile.');
      }

      const previousProfilePic = user.profile_pic || '';
      const nextProfilePic = data.profile_pic || profilePic;

      setProfilePic(nextProfilePic);
      setProfileFile(null);

      if (previousProfilePic && previousProfilePic !== nextProfilePic) {
        fetch(API_URL + '/api/media/image', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ imageUrl: previousProfilePic })
        }).catch(() => {});
      }
      setPassword('');
      setConfirmPassword('');
      setSuccess('Profile updated successfully. Refresh the page to see the new picture throughout SportSmack.');
    } catch (err) {
      setError(err.message || 'An unexpected error occurred.');
    } finally {
      setSaving(false);
    }
  };

  if (authLoading || !user) {
    return <div className="page-container">Loading...</div>;
  }

  return (
    <div className="page-container auth-container" style={{ alignItems: 'flex-start', paddingTop: '4rem' }}>
      <div className="auth-box" style={{ maxWidth: '600px' }}>
        <h1 className="auth-title">Account Settings</h1>

        {error && <div className="auth-error">{error}</div>}
        {success && (
          <div style={{ backgroundColor: '#dcfce7', color: '#166534', padding: '0.75rem', borderRadius: '8px', marginBottom: '1rem', textAlign: 'center' }}>
            {success}
          </div>
        )}

        <form onSubmit={handleSave} className="auth-form">
          <div className="form-group">
            <label htmlFor="profile-picture-file">Profile Picture</label>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
              <div style={{ width: '60px', height: '60px', borderRadius: '50%', backgroundColor: 'var(--border-color)', overflow: 'hidden', flexShrink: 0 }}>
                {(previewUrl || profilePic) ? (
                  <img
                    src={(previewUrl || profilePic) ? ((previewUrl || profilePic).includes('?') ? (previewUrl || profilePic) + '&variant=avatar' : (previewUrl || profilePic) + '?variant=avatar') : ''}
                    alt="Profile preview"
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : (
                  <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', fontWeight: 'bold' }}>
                    {user.username.charAt(0).toUpperCase()}
                  </div>
                )}
              </div>
              <div style={{ flex: 1 }}>
                <input
                  id="profile-picture-file"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleFileChange}
                  disabled={saving}
                  style={{ display: 'block', width: '100%', fontSize: '0.9rem' }}
                />
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.4rem' }}>
                  JPEG, PNG, or WebP. Maximum file size: 5 MB.
                </p>
                {profileFile && (
                  <p style={{ fontSize: '0.85rem' }}>
                    Selected: {profileFile.name}
                    <button
                      type="button"
                      onClick={() => {
                        setProfileFile(null);
                        const input = document.getElementById('profile-picture-file');
                        if (input) input.value = '';
                      }}
                      style={{ marginLeft: '0.5rem' }}
                    >
                      Remove
                    </button>
                  </p>
                )}
              </div>
            </div>
          </div>

          <div style={{ margin: '1rem 0', borderBottom: '1px solid var(--border-color)' }}></div>

          <h3 style={{ marginBottom: '0.5rem' }}>Change Password</h3>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
            Leave blank if you do not wish to change your password.
          </p>

          <div className="form-group">
            <label>New Password</label>
            <input
              type="password"
              value={password}
              onChange={event => setPassword(event.target.value)}
              placeholder="New secure password"
            />
          </div>

          <div className="form-group">
            <label>Confirm New Password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={event => setConfirmPassword(event.target.value)}
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
