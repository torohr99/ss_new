'use client';

import { useState } from 'react';

export default function CreatePost({ onPostCreated, forumTag = null }) {
  const [content, setContent] = useState('');
  const [imageUrl, setImageUrl] = useState('');
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
      const apiUrl =
        process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

      const token =
        typeof window !== 'undefined'
          ? localStorage.getItem('smack_token')
          : null;

      const res = await fetch(`${apiUrl}/api/posts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token
            ? { Authorization: `Bearer ${token}` }
            : {})
        },
        credentials: 'include',
        body: JSON.stringify({
          content: finalContent,
          image_url: imageUrl.trim() || null
        })
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        console.error('Create post failed:', res.status, data);

        throw new Error(
          data.message ||
          data.error ||
          `Failed to create post (${res.status})`
        );
      }

      setContent('');
      setImageUrl('');

      if (onPostCreated) {
        onPostCreated(data);
      }
    } catch (err) {
      console.error('Error creating post:', err);
      setError(err.message || 'Failed to create post.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="create-post-container">
      <textarea
        className="create-post-textarea"
        placeholder="What's on your mind? (Use keyboard emojis 😊)"
        rows="3"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        disabled={submitting}
      />

      <div className="create-post-actions">
        <input
          type="text"
          className="image-url-input"
          placeholder="Optional: Paste an image URL here..."
          value={imageUrl}
          onChange={(e) => setImageUrl(e.target.value)}
          disabled={submitting}
        />

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
