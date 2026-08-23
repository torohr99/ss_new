'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

export default function Notifications() {
  const [requests, setRequests] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    try {
      const [reqRes, notifRes] = await Promise.all([
        fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'}/api/users/requests`, { credentials: 'include' }),
        fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'}/api/users/me/notifications`, { credentials: 'include' })
      ]);
      
      if (reqRes.ok) {
        setRequests(await reqRes.json());
      }
      if (notifRes.ok) {
        setNotifications(await notifRes.json());
        // Mark as read
        fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'}/api/users/me/notifications/read`, { method: 'PUT', credentials: 'include' });
      }
    } catch (err) {
      console.error('Failed to fetch data', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleAction = async (userId, action) => {
    try {
      const method = action === 'ACCEPT' ? 'PUT' : 'DELETE';
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'}/api/users/${userId}/friend`, {
        method,
        credentials: 'include'
      });

      if (res.ok) {
        // Remove from list or refresh
        fetchRequests();
      }
    } catch (err) {
      console.error(err);
    }
  };

  if (loading) return <div className="page-container">Loading...</div>;

  return (
    <div className="page-container">
      <h1 className="page-title">Notifications</h1>
      
      <h2 className="section-title">Friend Requests ({requests.length})</h2>
      <div className="user-list">
        {requests.length > 0 ? (
          requests.map(req => (
            <div key={req.id} className="user-card">
              <div className="user-card-info">
                <Link href={`/profile/${req.user.id}`} className="user-card-name">
                  {req.user.username}
                </Link>
                <span className="user-card-date">Wants to be friends</span>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button className="btn btn-primary" onClick={() => handleAction(req.user.id, 'ACCEPT')}>Accept</button>
                <button className="btn btn-secondary" onClick={() => handleAction(req.user.id, 'DECLINE')}>Decline</button>
              </div>
            </div>
          ))
        ) : (
          <p>No pending friend requests.</p>
        )}
      </div>

      <h2 className="section-title" style={{ marginTop: '2rem' }}>Recent Activity</h2>
      <div className="user-list">
        {notifications.length > 0 ? (
          notifications.map(notif => (
            <div key={notif.id} className="user-card" style={{ background: notif.type === 'BADGE' ? 'rgba(255, 215, 0, 0.1)' : 'var(--bg-primary)' }}>
              <div className="user-card-info">
                <span className="user-card-name" style={{ color: notif.type === 'BADGE' ? 'var(--brand-red)' : 'var(--text-primary)' }}>
                  {notif.type === 'BADGE' ? '🏆 Achievement Unlocked!' : 'System'}
                </span>
                <span className="user-card-date">{notif.message}</span>
              </div>
              <div style={{ fontSize: '0.8rem', color: 'gray' }}>
                {new Date(notif.created_at).toLocaleDateString()}
              </div>
            </div>
          ))
        ) : (
          <p>No new notifications.</p>
        )}
      </div>
    </div>
  );
}
