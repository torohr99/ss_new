'use client';

import { useState, useEffect } from 'react';
import CreatePost from './CreatePost';
import PostCard from './PostCard';
import NewsCard from './NewsCard';

export default function Feed() {
  const [feedItems, setFeedItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [filterType, setFilterType] = useState('all'); // 'all', 'posts', 'news'
  const [nextCursor, setNextCursor] = useState(null);

  useEffect(() => {
    fetchFeed();
  }, []);

  const fetchFeed = async (cursor = null) => {
    try {
      if (cursor) setLoadingMore(true);
      else setLoading(true);

      const url = cursor 
        ? `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'}/api/posts?cursor=${cursor}`
        : `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'}/api/posts`;

      const [postsRes, newsRes] = await Promise.all([
        fetch(url, { credentials: 'include' }),
        !cursor ? fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'}/api/users/feed/news`, { credentials: 'include' }) : Promise.resolve(null)
      ]);

      let postsData = { posts: [], nextCursor: null };
      let news = [];

      if (postsRes.ok) postsData = await postsRes.json();
      if (newsRes && newsRes.ok) news = await newsRes.json();

      const formattedPosts = postsData.posts.map(p => ({ ...p, feedType: 'post', sortDate: new Date(p.created_at || p.createdAt) }));
      const formattedNews = news.map(n => ({ ...n, feedType: 'news', sortDate: new Date(n.published) }));

      setNextCursor(postsData.nextCursor);

      if (cursor) {
        setFeedItems(prev => [...prev, ...formattedPosts].sort((a, b) => b.sortDate - a.sortDate));
      } else {
        const combined = [...formattedPosts, ...formattedNews].sort((a, b) => b.sortDate - a.sortDate);
        setFeedItems(combined);
      }
    } catch (err) {
      console.error('Failed to fetch feed', err);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const handlePostCreated = (newPost) => {
    const formatted = { ...newPost, feedType: 'post', sortDate: new Date(newPost.created_at || newPost.createdAt) };
    setFeedItems(prev => [formatted, ...prev]);
  };

  const filteredItems = feedItems.filter(item => {
    if (filterType === 'all') return true;
    return item.feedType === filterType;
  });

  return (
    <div className="feed-container">
      <h2 className="feed-header">Latest Smack</h2>
      
      <CreatePost onPostCreated={handlePostCreated} />

      <div className="feed-controls">
        <button className={`feed-toggle ${filterType === 'all' ? 'active' : ''}`} onClick={() => setFilterType('all')}>All Updates</button>
        <button className={`feed-toggle ${filterType === 'posts' ? 'active' : ''}`} onClick={() => setFilterType('posts')}>Social</button>
        <button className={`feed-toggle ${filterType === 'news' ? 'active' : ''}`} onClick={() => setFilterType('news')}>News</button>
      </div>

      <div className="feed-content">
        {loading ? (
          <div className="skeleton" style={{ height: '200px', width: '100%', borderRadius: '12px', marginTop: '1rem' }}></div>
        ) : filteredItems.length > 0 ? (
          <>
            {filteredItems.map(item => (
              item.feedType === 'post' 
                ? <PostCard key={`post_${item.id}`} post={item} />
                : <NewsCard key={`news_${item.id}`} article={item} />
            ))}
            {(filterType === 'all' || filterType === 'posts') && nextCursor && (
              <button 
                className="btn-secondary" 
                style={{ width: '100%', padding: '1rem', marginTop: '1rem' }}
                onClick={() => fetchFeed(nextCursor)}
                disabled={loadingMore}
              >
                {loadingMore ? 'Loading more...' : 'Load More'}
              </button>
            )}
          </>
        ) : (
          <div className="post-card" style={{ textAlign: 'center', padding: '3rem', marginTop: '1rem', background: 'var(--glass-bg)', backdropFilter: 'blur(10px)', border: '1px solid var(--glass-border)' }}>
            <h3 style={{ fontSize: '1.5rem', marginBottom: '0.5rem', color: 'var(--text-primary)' }}>No activity yet</h3>
            <p style={{ color: 'var(--text-secondary)' }}>Be the first to talk some smack!</p>
          </div>
        )}
      </div>
    </div>
  );
}
