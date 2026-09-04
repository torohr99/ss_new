'use client';

import { useState } from 'react';
import Link from 'next/link';

const getAuthHeaders = () => {
  if (
    typeof window === 'undefined'
  ) {
    return {};
  }

  const token =
    localStorage.getItem(
      'smack_token'
    );

  return token
    ? {
        Authorization:
          `Bearer ${token}`
      }
    : {};
};

export default function PostCard({ post }) {
  const [isLiked, setIsLiked] = useState(post.hasLiked);
  const [likesCount, setLikesCount] = useState(post._count.likes);
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [commentsCount, setCommentsCount] = useState(post._count.comments);
  const [loadingComments, setLoadingComments] = useState(false);

  const toggleLike = async () => {
    const originalLiked = isLiked;
    // Optimistic update
    setIsLiked(!isLiked);
    setLikesCount(prev => (originalLiked ? prev - 1 : prev + 1));

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'}/api/posts/${post.id}/like`, {
        method: 'POST',
        credentials: 'include'
      });
      if (!res.ok) {
        throw new Error('Failed to toggle like');
      }
    } catch (err) {
      console.error(err);
      // Revert if failed
      setIsLiked(originalLiked);
      setLikesCount(prev => (originalLiked ? prev + 1 : prev - 1));
    }
  };

  const fetchComments = async () => {
    setLoadingComments(true);
    try {
      const res = await fetch(
  `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'}/api/posts/${post.id}/like`,
  {
    method: 'POST',
    credentials: 'include',
    headers: getAuthHeaders()
  }
);
      if (res.ok) {
        setComments(await res.json());
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingComments(false);
    }
  };

  const toggleComments = () => {
    if (!showComments && comments.length === 0 && commentsCount > 0) {
      fetchComments();
    }
    setShowComments(!showComments);
  };

  const submitComment = async (e) => {
    e.preventDefault();
    if (!newComment.trim()) return;

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'}/api/posts/${post.id}/comment`, {
        method: 'POST',
        headers: {
          'Content-Type':
            'application/json',
          ...getAuthHeaders()
        },
        body: JSON.stringify({ content: newComment }),
        credentials: 'include',
        headers: getAuthHeaders()
      });

      if (res.ok) {
        const commentData = await res.json();
        setComments(prev => [...prev, commentData]);
        setCommentsCount(prev => prev + 1);
        setNewComment('');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const authorInitials = post.user.username.substring(0, 2).toUpperCase();

  return (
    <div className="post-card">
      <div className="post-header">
        <div className="post-avatar">{authorInitials}</div>
        <div>
          <Link href={`/profile/${post.user.id}`} className="post-author">
            {post.user.username}
          </Link>
          <span className="post-time">{new Date(post.created_at).toLocaleString()}</span>
        </div>
      </div>

      <div className="post-content">{post.content.replace(/^\[FORUM:[^\]]+\]\s*/, '')}</div>

      {post.image_url && (
        <img src={post.image_url} alt="Post attachment" className="post-image" loading="lazy" />
      )}

      <div className="post-actions">
        <button 
          className={`action-btn ${isLiked ? 'liked' : ''}`} 
          onClick={toggleLike}
        >
          {isLiked ? '❤️' : '🤍'} {likesCount}
        </button>
        <button className="action-btn" onClick={toggleComments}>
          💬 {commentsCount}
        </button>
      </div>

      {showComments && (
        <div className="comments-section">
          {loadingComments ? (
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Loading comments...</p>
          ) : (
            <div className="comment-list">
              {comments.map(c => (
                <div key={c.id} className="comment-item">
                  <div className="comment-avatar">{c.user.username[0].toUpperCase()}</div>
                  <div className="comment-bubble">
                    <div className="comment-author">{c.user.username}</div>
                    <div className="comment-text">{c.content}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
          <form className="comment-input-area" onSubmit={submitComment}>
            <input 
              type="text" 
              className="comment-input" 
              placeholder="Write a comment..." 
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
            />
            <button type="submit" className="btn btn-primary" style={{ padding: '0.5rem 1rem' }} disabled={!newComment.trim()}>
              Send
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
