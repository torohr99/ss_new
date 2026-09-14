'use client';

import { useState, useEffect } from 'react';
import CreatePost from './CreatePost';
import PostCard from './PostCard';
import NewsCard from './NewsCard';

export default function Feed() {
  const [feedItems, setFeedItems] = useState([]);
  const [socialItems, setSocialItems] = useState([]);

  const [loading, setLoading] = useState(true);
  const [socialLoading, setSocialLoading] = useState(false);

  const [loadingMore, setLoadingMore] = useState(false);
  const [socialLoadingMore, setSocialLoadingMore] = useState(false);

  const [filterType, setFilterType] = useState('all');

  const [nextCursor, setNextCursor] = useState(null);
  const [socialNextCursor, setSocialNextCursor] =
    useState(null);

  useEffect(() => {
    let cancelled = false;

    fetchFeed(null, cancelled)
      .catch(error => {
        if (!cancelled) {
          console.error(
            'Failed to initialize feed:',
            error
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (filterType !== 'posts') {
      return;
    }

    if (
      socialItems.length > 0 ||
      socialLoading
    ) {
      return;
    }

    let cancelled = false;

    fetchSocialFeed(null, cancelled)
      .catch(error => {
        if (!cancelled) {
          console.error(
            'Failed to initialize social feed:',
            error
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    filterType,
    socialItems.length,
    socialLoading
  ]);

  const fetchFeed = async (
    cursor = null,
    cancelled = false
  ) => {
    try {
      if (cursor) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }

      const apiUrl =
        process.env.NEXT_PUBLIC_API_URL ||
        'http://localhost:5000';

      const url = cursor
        ? `${apiUrl}/api/posts?cursor=${cursor}`
        : `${apiUrl}/api/posts`;

      const [postsRes, newsRes] =
        await Promise.all([
          fetch(url, {
            credentials: 'include'
          }),

          !cursor
            ? fetch(
                `${apiUrl}/api/users/feed/news`,
                {
                  credentials: 'include'
                }
              )
            : Promise.resolve(null)
        ]);

      let postsData = {
        posts: [],
        nextCursor: null
      };

      let news = [];

      if (postsRes.ok) {
        postsData = await postsRes.json();
      } else {
        console.error(
          'Failed to fetch posts:',
          postsRes.status
        );
      }

      if (newsRes && newsRes.ok) {
        news = await newsRes.json();
      }

      if (cancelled) {
        return;
      }

      const formattedPosts =
        (postsData.posts || []).map(p => ({
          ...p,
          feedType: 'post',
          sortDate: new Date(
            p.created_at || p.createdAt
          )
        }));

      const formattedNews =
        (news || []).map(n => ({
          ...n,
          feedType: 'news',
          sortDate: new Date(n.published)
        }));

      setNextCursor(
        postsData.nextCursor
      );

      if (cursor) {
        setFeedItems(prev =>
          [...prev, ...formattedPosts].sort(
            (a, b) =>
              b.sortDate - a.sortDate
          )
        );
      } else {
        const combined = [
          ...formattedPosts,
          ...formattedNews
        ].sort(
          (a, b) =>
            b.sortDate - a.sortDate
        );

        setFeedItems(combined);
      }
    } catch (err) {
      console.error(
        'Failed to fetch feed:',
        err
      );
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const fetchSocialFeed = async (
    cursor = null,
    cancelled = false
  ) => {
    try {
      if (cursor) {
        setSocialLoadingMore(true);
      } else {
        setSocialLoading(true);
      }

      const apiUrl =
        process.env.NEXT_PUBLIC_API_URL ||
        'http://localhost:5000';

      const url = cursor
        ? `${apiUrl}/api/posts/social?cursor=${cursor}`
        : `${apiUrl}/api/posts/social`;

      const response = await fetch(url, {
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error(
          `Social feed request failed: ${response.status}`
        );
      }

      const data = await response.json();

      if (cancelled) {
        return;
      }

      const formattedPosts =
        (data.posts || []).map(post => ({
          ...post,
          feedType: 'post',
          sortDate: new Date(
            post.created_at ||
              post.createdAt
          )
        }));

      setSocialNextCursor(
        data.nextCursor
      );

      if (cursor) {
        setSocialItems(prev =>
          [...prev, ...formattedPosts].sort(
            (a, b) =>
              b.sortDate - a.sortDate
          )
        );
      } else {
        setSocialItems(
          formattedPosts.sort(
            (a, b) =>
              b.sortDate - a.sortDate
          )
        );
      }
    } catch (error) {
      console.error(
        'Failed to fetch social feed:',
        error
      );
    } finally {
      setSocialLoading(false);
      setSocialLoadingMore(false);
    }
  };

  const handlePostCreated = newPost => {
    const formatted = {
      ...newPost,
      feedType: 'post',
      sortDate: new Date(
        newPost.created_at ||
          newPost.createdAt
      )
    };

    setFeedItems(prev => [
      formatted,
      ...prev
    ]);

    setSocialItems(prev => [
      formatted,
      ...prev
    ]);
  };

  const displayedItems =
    filterType === 'posts'
      ? socialItems
      : feedItems;

  return (
    <div className="feed-container">
      <h2 className="feed-header">
        Latest Smack
      </h2>

      <CreatePost
        onPostCreated={handlePostCreated}
      />

      <div className="feed-controls">
        <button
          className={`feed-toggle ${
            filterType === 'all'
              ? 'active'
              : ''
          }`}
          onClick={() =>
            setFilterType('all')
          }
        >
          All Updates
        </button>

        <button
          className={`feed-toggle ${
            filterType === 'posts'
              ? 'active'
              : ''
          }`}
          onClick={() =>
            setFilterType('posts')
          }
        >
          Social
        </button>

        <button
          className={`feed-toggle ${
            filterType === 'news'
              ? 'active'
              : ''
          }`}
          onClick={() =>
            setFilterType('news')
          }
        >
          News
        </button>
      </div>

      <div className="feed-content">
        {(
          filterType === 'all'
            ? loading
            : filterType === 'posts'
              ? socialLoading
              : loading
        ) ? (
          <div
            className="skeleton"
            style={{
              height: '200px',
              width: '100%',
              borderRadius: '12px',
              marginTop: '1rem'
            }}
          ></div>
        ) : filterType === 'news' ? (
          feedItems.filter(
            item =>
              item.feedType === 'news'
          ).length > 0 ? (
            <>
              {feedItems
                .filter(
                  item =>
                    item.feedType ===
                    'news'
                )
                .map(item => (
                  <NewsCard
                    key={`news_${item.id}`}
                    article={item}
                  />
                ))}
            </>
          ) : (
            <div
              className="post-card"
              style={{
                textAlign: 'center',
                padding: '3rem',
                marginTop: '1rem',
                background:
                  'var(--glass-bg)',
                backdropFilter:
                  'blur(10px)',
                border:
                  '1px solid var(--glass-border)'
              }}
            >
              <h3
                style={{
                  fontSize: '1.5rem',
                  marginBottom:
                    '0.5rem',
                  color:
                    'var(--text-primary)'
                }}
              >
                No news yet
              </h3>

              <p
                style={{
                  color:
                    'var(--text-secondary)'
                }}
              >
                Follow teams to see
                their latest news.
              </p>
            </div>
          )
        ) : displayedItems.length > 0 ? (
          <>
            {displayedItems.map(item =>
              item.feedType === 'post' ? (
                <PostCard
                  key={`post_${item.id}`}
                  post={item}
                />
              ) : (
                <NewsCard
                  key={`news_${item.id}`}
                  article={item}
                />
              )
            )}

            {filterType === 'all' &&
              nextCursor && (
                <button
                  className="btn-secondary"
                  style={{
                    width: '100%',
                    padding: '1rem',
                    marginTop: '1rem'
                  }}
                  onClick={() =>
                    fetchFeed(nextCursor)
                  }
                  disabled={
                    loadingMore
                  }
                >
                  {loadingMore
                    ? 'Loading more...'
                    : 'Load More'}
                </button>
              )}

            {filterType === 'posts' &&
              socialNextCursor && (
                <button
                  className="btn-secondary"
                  style={{
                    width: '100%',
                    padding: '1rem',
                    marginTop: '1rem'
                  }}
                  onClick={() =>
                    fetchSocialFeed(
                      socialNextCursor
                    )
                  }
                  disabled={
                    socialLoadingMore
                  }
                >
                  {socialLoadingMore
                    ? 'Loading more...'
                    : 'Load More'}
                </button>
              )}
          </>
        ) : (
          <div
            className="post-card"
            style={{
              textAlign: 'center',
              padding: '3rem',
              marginTop: '1rem',
              background:
                'var(--glass-bg)',
              backdropFilter:
                'blur(10px)',
              border:
                '1px solid var(--glass-border)'
            }}
          >
            <h3
              style={{
                fontSize: '1.5rem',
                marginBottom:
                  '0.5rem',
                color:
                  'var(--text-primary)'
              }}
            >
              {filterType === 'posts'
                ? 'No social activity yet'
                : 'No activity yet'}
            </h3>

            <p
              style={{
                color:
                  'var(--text-secondary)'
              }}
            >
              {filterType === 'posts'
                ? 'Add some friends to see their posts here.'
                : 'Be the first to talk some smack!'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
