'use client';

import { useState, useEffect } from 'react';
import ProtectedRoute from '../../components/ProtectedRoute';
import { useAuth } from '../context/AuthContext';
import CreatePost from '../../components/CreatePost';
import PostCard from '../../components/PostCard';

const FORUM_CATEGORIES = [
  { id: 'general', name: 'General Discussion', icon: '💬' },
  { id: 'rumors', name: 'Trade Rumors', icon: '🕵️' },
  { id: 'games', name: 'Game Threads', icon: '🏈' },
  { id: 'offseason', name: 'Offseason', icon: '🌴' }
];

export default function ForumsPage() {
  const { user } = useAuth();
  const [teams, setTeams] = useState([]);
  const [activeTeam, setActiveTeam] = useState(null);
  const [activeCategory, setActiveCategory] = useState(FORUM_CATEGORIES[0]);
  
  const [posts, setPosts] = useState([]);
  const [loadingPosts, setLoadingPosts] = useState(false);
  const [loadingTeams, setLoadingTeams] = useState(true);

  useEffect(() => {
    if (user) {
      fetchMyTeams();
    }
  }, [user]);

  useEffect(() => {
    if (activeTeam && activeCategory) {
      fetchForumPosts();
    }
  }, [activeTeam, activeCategory]);

  const fetchMyTeams = async () => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'}/api/users/me/teams/details`, {
        credentials: 'include'
      });
      if (res.ok) {
        const data = await res.json();
        setTeams(data);
        if (data.length > 0) {
          setActiveTeam(data[0]);
        }
      }
    } catch (err) {
      console.error('Failed to fetch teams', err);
    } finally {
      setLoadingTeams(false);
    }
  };

  const fetchForumPosts = async () => {
    setLoadingPosts(true);
    setPosts([]);
    try {
      const forumTag = `${activeTeam.id}_${activeCategory.id}`;
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'}/api/posts?forum=${forumTag}`, {
        credentials: 'include'
      });
      if (res.ok) {
        const data = await res.json();
        setPosts(data.posts);
      }
    } catch (err) {
      console.error('Failed to fetch forum posts', err);
    } finally {
      setLoadingPosts(false);
    }
  };

  const handlePostCreated = (newPost) => {
    setPosts(prev => [newPost, ...prev]);
  };

  return (
    <ProtectedRoute>
      <div className="page-container" style={{ maxWidth: '1200px', display: 'flex', gap: '2rem' }}>
        
        {/* Teams Sidebar */}
        <div style={{ width: '250px', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>My Communities</h2>
          {loadingTeams ? (
            <div style={{ color: 'var(--text-secondary)' }}>Loading teams...</div>
          ) : teams.length === 0 ? (
            <div style={{ color: 'var(--text-secondary)' }}>Follow teams to access their forums!</div>
          ) : (
            teams.map(team => (
              <button
                key={team.id}
                onClick={() => setActiveTeam(team)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem',
                  background: activeTeam?.id === team.id ? 'var(--accent-color)' : 'var(--glass-bg)',
                  border: '1px solid var(--border-color)', borderRadius: '8px',
                  color: activeTeam?.id === team.id ? 'white' : 'var(--text-primary)',
                  cursor: 'pointer', textAlign: 'left', fontWeight: 'bold'
                }}
              >
                <img src={team.logo_url} alt={team.name} style={{ width: '24px', height: '24px', borderRadius: '50%', background: 'white' }} />
                <span>{team.name}</span>
              </button>
            ))
          )}
        </div>

        {/* Main Forum Area */}
        <div style={{ flex: 1 }}>
          {activeTeam ? (
            <>
              {/* Categories Tabs */}
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '2rem', overflowX: 'auto', paddingBottom: '0.5rem' }}>
                {FORUM_CATEGORIES.map(cat => (
                  <button
                    key={cat.id}
                    onClick={() => setActiveCategory(cat)}
                    style={{
                      padding: '0.75rem 1.5rem',
                      background: activeCategory.id === cat.id ? 'var(--text-primary)' : 'var(--glass-bg)',
                      color: activeCategory.id === cat.id
                        ? '#000000'
                        : 'var(--text-secondary)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '50px',
                      cursor: 'pointer',
                      fontWeight: 'bold',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {cat.icon} {cat.name}
                  </button>
                ))}
              </div>

              {/* Forum Header */}
              <div style={{ padding: '1.5rem', background: 'var(--glass-bg)', borderRadius: '12px', border: '1px solid var(--border-color)', marginBottom: '2rem' }}>
                <h1 style={{ margin: '0 0 0.5rem 0', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <img src={activeTeam.logo_url} alt={activeTeam.name} style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'white' }} />
                  {activeTeam.city} {activeTeam.name} - {activeCategory.name}
                </h1>
                <p style={{ color: 'var(--text-secondary)', margin: 0 }}>Join the conversation with other {activeTeam.name} fans!</p>
              </div>

              {/* Create Post */}
              <CreatePost 
                onPostCreated={handlePostCreated} 
                forumTag={`${activeTeam.id}_${activeCategory.id}`} 
              />

              {/* Posts Feed */}
              <div style={{ marginTop: '2rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {loadingPosts ? (
                  <div style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '2rem' }}>Loading posts...</div>
                ) : posts.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '3rem', background: 'var(--glass-bg)', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                    <h3 style={{ color: 'var(--text-primary)', marginBottom: '0.5rem' }}>No posts here yet.</h3>
                    <p style={{ color: 'var(--text-secondary)' }}>Be the first to start the discussion!</p>
                  </div>
                ) : (
                  posts.map(post => (
                    <PostCard key={post.id} post={post} />
                  ))
                )}
              </div>
            </>
          ) : (
            <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-secondary)' }}>
              {loadingTeams ? 'Loading...' : 'Please select a team to view its forum.'}
            </div>
          )}
        </div>

      </div>
    </ProtectedRoute>
  );
}
