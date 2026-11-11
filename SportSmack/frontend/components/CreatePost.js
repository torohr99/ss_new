'use client';

import { useState } from 'react';

const API_URL =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

async function uploadImage(file, purpose) {
  const authorization = await fetch(`${API_URL}/api/media/upload-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      purpose,
      contentType: file.type
    })
  });

  const authorizationData = await authorization.json().catch(() => ({}));
  if (!authorization.ok) {
    throw new Error(
      authorizationData.message || 'Unable to authorize image upload.'
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
    throw new Error(uploadData.message || 'Image upload failed.');
  }

  return uploadData.imageUrl;
}

export default function CreatePost({ onPostCreated, forumTag = null }) {
  const [content, setContent] = useState('');
  const [imageFile, setImageFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!content.trim() || submitting) return;

    setSubmitting(true);
    setError('');

    const finalContent = forumTag
      ? `[FORUM:${forumTag}] ${content.trim()}`
      : content.trim();

    try {
      let imageUrl = null;

      if (imageFile) {
        imageUrl = await uploadImage(imageFile, 'post');
      }

      const res = await fetch(`${API_URL}/api/posts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          content: finalContent,
          image_url: imageUrl
        })
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          data.message ||
          data.error ||
          `Failed to create post (${res.status})`
        );
      }

      setContent('');
      setImageFile(null);
      const fileInput = document.getElementById('create-post-image');
      if (fileInput) fileInput.value = '';

      if (onPostCreated) onPostCreated(data);
    } catch (err) {
      console.error('Error creating post:', err);
      setError(err.message || 'Failed to create post.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleFileChange = event => {
    const file = event.target.files?.[0] || null;
    if (!file) {
      setImageFile(null);
      return;
    }

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Choose a JPEG, PNG, or WebP image.');
      event.target.value = '';
      setImageFile(null);
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError('Images must be 5 MB or smaller.');
      event.target.value = '';
      setImageFile(null);
      return;
    }

    setError('');
    setImageFile(file);
  };

  return (
    <div className="create-post-container">
      <textarea
        className="create-post-textarea"
        placeholder="What's on your mind? (Use keyboard emojis 😊)"
        rows="3"
        value={content}
        onChange={event => setContent(event.target.value)}
        disabled={submitting}
      />

      <div className="create-post-actions">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', flex: 1 }}>
          <label htmlFor="create-post-image">Attach image (JPEG, PNG, or WebP; max 5 MB)</label>
          <input
            id="create-post-image"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleFileChange}
            disabled={submitting}
          />
          {imageFile && (
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Selected: {imageFile.name}
              <button
                type="button"
                onClick={() => {
                  setImageFile(null);
                  const input = document.getElementById('create-post-image');
                  if (input) input.value = '';
                }}
                disabled={submitting}
                style={{ marginLeft: '0.5rem' }}
              >
                Remove
              </button>
            </span>
          )}
        </div>

        <button
          type="button"
          className="btn btn-primary"
          onClick={handleSubmit}
          disabled={submitting || !content.trim()}
        >
          {submitting ? 'Posting...' : 'Post'}
        </button>
      </div>

      {error && (
        <div
          style={{
            marginTop: '0.75rem',
            color: '#ff6b6b',
            fontSize: '0.9rem'
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
}
