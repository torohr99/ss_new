'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  'http://localhost:5000';

export default function Notifications() {
  const [requests, setRequests] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] =
    useState(null);

  const fetchData = async () => {
    try {
      const [
        reqRes,
        notifRes
      ] = await Promise.all([
        fetch(
          `${API_URL}/api/users/requests`,
          {
            credentials: 'include'
          }
        ),
        fetch(
          `${API_URL}/api/users/me/notifications`,
          {
            credentials: 'include'
          }
        )
      ]);

      if (reqRes.ok) {
        const requestData =
          await reqRes.json();

        setRequests(
          Array.isArray(requestData)
            ? requestData
            : []
        );
      }

      if (notifRes.ok) {
        const notificationData =
          await notifRes.json();

        setNotifications(
          Array.isArray(
            notificationData.notifications
          )
            ? notificationData.notifications
            : []
        );

        setUnreadCount(
          Number(
            notificationData.unreadCount
          ) || 0
        );
      }
    } catch (error) {
      console.error(
        'Failed to fetch notifications:',
        error
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const markNotificationRead =
    async (notificationId) => {
      try {
        const res = await fetch(
          `${API_URL}/api/users/me/notifications/${notificationId}/read`,
          {
            method: 'PUT',
            credentials: 'include'
          }
        );

        if (!res.ok) {
          throw new Error(
            'Failed to mark notification as read'
          );
        }

        setNotifications(
          current =>
            current.map(notification =>
              notification.id ===
              notificationId
                ? {
                    ...notification,
                    read: true
                  }
                : notification
            )
        );

        setUnreadCount(
          current =>
            Math.max(0, current - 1)
        );
      } catch (error) {
        console.error(error);
      }
    };

  const markAllRead = async () => {
    if (unreadCount === 0) {
      return;
    }

    try {
      const res = await fetch(
        `${API_URL}/api/users/me/notifications/read`,
        {
          method: 'PUT',
          credentials: 'include'
        }
      );

      if (!res.ok) {
        throw new Error(
          'Failed to mark notifications as read'
        );
      }

      setNotifications(
        current =>
          current.map(notification => ({
            ...notification,
            read: true
          }))
      );

      setUnreadCount(0);
    } catch (error) {
      console.error(error);
    }
  };

  const handleAction = async (
    userId,
    action
  ) => {
    setActionLoading(userId);

    try {
      const method =
        action === 'ACCEPT'
          ? 'PUT'
          : 'DELETE';

      const res = await fetch(
        `${API_URL}/api/users/${userId}/friend`,
        {
          method,
          credentials: 'include'
        }
      );

      if (!res.ok) {
        const data =
          await res.json().catch(
            () => ({})
          );

        throw new Error(
          data.message ||
            'Unable to update friend request'
        );
      }

      await fetchData();
    } catch (error) {
      console.error(
        'Friend request action failed:',
        error
      );
    } finally {
      setActionLoading(null);
    }
  };

  const getNotificationTitle =
    (notification) => {
      switch (notification.type) {
        case 'BADGE':
          return '🏆 Achievement Unlocked!';

        case 'FRIEND_REQUEST':
          return '👥 Friend Request';

        case 'FRIEND_ACCEPTED':
          return '🤝 Friend Request Accepted';

        default:
          return 'System';
      }
    };

  const getNotificationColor =
    (notification) => {
      if (
        notification.type === 'BADGE'
      ) {
        return 'var(--brand-red)';
      }

      if (
        notification.type ===
          'FRIEND_REQUEST' ||
        notification.type ===
          'FRIEND_ACCEPTED'
      ) {
        return 'var(--accent-color)';
      }

      return 'var(--text-primary)';
    };

  if (loading) {
    return (
      <div className="page-container">
        Loading notifications...
      </div>
    );
  }

  return (
    <div className="page-container">
      <div
        style={{
          display: 'flex',
          justifyContent:
            'space-between',
          alignItems: 'center',
          gap: '1rem',
          marginBottom: '1.5rem'
        }}
      >
        <h1 className="page-title">
          Notifications
          {unreadCount > 0 && (
            <span
              style={{
                marginLeft: '0.6rem',
                fontSize: '0.75rem',
                verticalAlign: 'middle',
                background:
                  'var(--brand-red)',
                color: 'white',
                borderRadius: '999px',
                padding:
                  '0.2rem 0.55rem'
              }}
            >
              {unreadCount} unread
            </span>
          )}
        </h1>

        {unreadCount > 0 && (
          <button
            className="btn btn-secondary"
            onClick={markAllRead}
          >
            Mark all as read
          </button>
        )}
      </div>

      <h2 className="section-title">
        Friend Requests ({requests.length})
      </h2>

      <div className="user-list">
        {requests.length > 0 ? (
          requests.map(req => (
            <div
              key={req.id}
              className="user-card"
            >
              <div className="user-card-info">
                <Link
                  href={`/profile/${req.user.id}`}
                  className="user-card-name"
                >
                  {req.user.username}
                </Link>

                <span className="user-card-date">
                  Wants to be friends
                </span>
              </div>

              <div
                style={{
                  display: 'flex',
                  gap: '0.5rem'
                }}
              >
                <button
                  className="btn btn-primary"
                  disabled={
                    actionLoading ===
                    req.user.id
                  }
                  onClick={() =>
                    handleAction(
                      req.user.id,
                      'ACCEPT'
                    )
                  }
                >
                  {actionLoading ===
                  req.user.id
                    ? '...'
                    : 'Accept'}
                </button>

                <button
                  className="btn btn-secondary"
                  disabled={
                    actionLoading ===
                    req.user.id
                  }
                  onClick={() =>
                    handleAction(
                      req.user.id,
                      'DECLINE'
                    )
                  }
                >
                  Decline
                </button>
              </div>
            </div>
          ))
        ) : (
          <p>
            No pending friend requests.
          </p>
        )}
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent:
            'space-between',
          alignItems: 'center',
          marginTop: '2rem'
        }}
      >
        <h2 className="section-title">
          Recent Activity
        </h2>
      </div>

      <div className="user-list">
        {notifications.length > 0 ? (
          notifications.map(
            notification => (
              <button
                key={notification.id}
                type="button"
                onClick={() =>
                  !notification.read &&
                  markNotificationRead(
                    notification.id
                  )
                }
                style={{
                  width: '100%',
                  textAlign: 'left',
                  border: 'none',
                  cursor:
                    notification.read
                      ? 'default'
                      : 'pointer',
                  padding: 0,
                  background:
                    'transparent'
                }}
              >
                <div
                  className="user-card"
                  style={{
                    background:
                      notification.type ===
                      'BADGE'
                        ? 'rgba(255, 215, 0, 0.1)'
                        : notification.read
                        ? 'var(--bg-primary)'
                        : 'rgba(255, 255, 255, 0.06)',
                    borderLeft:
                      notification.read
                        ? '3px solid transparent'
                        : '3px solid var(--brand-red)',
                    opacity:
                      notification.read
                        ? 0.72
                        : 1
                  }}
                >
                  <div
                    className="user-card-info"
                  >
                    <span
                      className="user-card-name"
                      style={{
                        color:
                          getNotificationColor(
                            notification
                          ),
                        fontWeight:
                          notification.read
                            ? 500
                            : 700
                      }}
                    >
                      {getNotificationTitle(
                        notification
                      )}
                    </span>

                    <span className="user-card-date">
                      {notification.message}
                    </span>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      flexDirection:
                        'column',
                      alignItems: 'flex-end',
                      gap: '0.25rem',
                      fontSize: '0.8rem',
                      color: 'gray'
                    }}
                  >
                    {!notification.read && (
                      <span
                        style={{
                          color:
                            'var(--brand-red)',
                          fontWeight: 700
                        }}
                      >
                        NEW
                      </span>
                    )}

                    <span>
                      {new Date(
                        notification.created_at
                      ).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </button>
            )
          )
        ) : (
          <p>
            No recent notifications.
          </p>
        )}
      </div>
    </div>
  );
}
