'use client';

import { useState } from 'react';

export default function CreatePost({ onPostCreated, forumTag = null }) {
  const [content, setContent] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!content.trim()) return;

    setSubmitting(true);
    const finalContent = forumTag ? `[FORUM:${forumTag}] ${content.trim()}` : content.trim();

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'}/api/posts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: finalContent, image_url: imageUrl }),
        credentials: 'include'
      });

      if (res.ok) {
        const newPost = await res.json();
        setContent('');
        setImageUrl('');
        if (onPostCreated) {
          onPostCreated(newPost);
        }
      } else {
        alert('Failed to create post');
      }
    } catch (err) {
      console.error(err);
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
      />
      <div className="create-post-actions">
        <input
          type="text"
          className="image-url-input"
          placeholder="Optional: Paste an image URL here..."
          value={imageUrl}
          onChange={(e) => setImageUrl(e.target.value)}
        />
        <button 
          className="btn btn-primary" 
          onClick={handleSubmit}
          disabled={submitting || !content.trim()}
        >
          {submitting ? 'Posting...' : 'Post'}
        </button>
      </div>
    </div>
  );
}
