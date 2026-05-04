import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, addMonths, subMonths, isSameMonth, isSameDay, parseISO } from 'date-fns';
import { FiSend, FiTrash2, FiClock, FiCheckCircle, FiAlertCircle, FiCalendar, FiChevronLeft, FiChevronRight, FiMoon, FiSun, FiZap, FiFileText, FiRefreshCw } from 'react-icons/fi';

const API = 'http://localhost:3001/api';

const Dashboard = ({ themeToggle, theme }) => {
  const [posts, setPosts] = useState([]);
  const [stats, setStats] = useState({ scheduled: 0, posted: 0, pending: 0, failed: 0, postedToday: 0, draft: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [toast, setToast] = useState(null);
  const [autoMode, setAutoMode] = useState(false);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchData = useCallback(async () => {
    try {
      const [postsRes, statsRes, settingsRes] = await Promise.all([
        axios.get(`${API}/posts`),
        axios.get(`${API}/stats`),
        axios.get(`${API}/settings`)
      ]);
      setPosts(postsRes.data);
      setStats(statsRes.data);
      setAutoMode(settingsRes.data.autoMode);
    } catch (err) {
      console.error('Fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 15000); // Auto-refresh every 15s
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleSendNow = async (id) => {
    try {
      await axios.post(`${API}/posts/${id}/send`);
      showToast('Message sent successfully!');
      fetchData();
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed to send';
      showToast(msg, 'error');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this post?')) return;
    try {
      await axios.delete(`${API}/posts/${id}`);
      showToast('Post deleted');
      fetchData();
    } catch (err) {
      showToast('Failed to delete', 'error');
    }
  };

  const toggleAutoMode = async () => {
    try {
      const res = await axios.post(`${API}/settings`, { autoMode: !autoMode });
      setAutoMode(res.data.autoMode);
      showToast(`${res.data.autoMode ? 'Auto' : 'Manual'} mode enabled`);
    } catch (err) {
      showToast('Failed to update mode', 'error');
    }
  };

  // ── Calendar Logic ──────────────────────────────────────
  const renderCalendar = () => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const calStart = startOfWeek(monthStart);
    const calEnd = endOfWeek(monthEnd);
    const days = [];
    let day = calStart;

    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    const scheduledDates = posts
      .filter(p => p.status === 'scheduled' || p.status === 'pending')
      .map(p => p.scheduled_time ? parseISO(p.scheduled_time) : null)
      .filter(Boolean);

    while (day <= calEnd) {
      days.push(day);
      day = addDays(day, 1);
    }

    return (
      <div className="card calendar-card animate-in animate-delay-2">
        <div className="calendar-header">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
            <FiCalendar /> {format(currentMonth, 'MMMM yyyy')}
          </h3>
          <div className="calendar-nav">
            <button className="btn btn-ghost btn-icon" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
              <FiChevronLeft />
            </button>
            <button className="btn btn-ghost btn-icon" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
              <FiChevronRight />
            </button>
          </div>
        </div>
        <div className="calendar-grid">
          {dayNames.map(d => <div key={d} className="calendar-day-name">{d}</div>)}
          {days.map((d, i) => {
            const hasPost = scheduledDates.some(sd => isSameDay(sd, d));
            return (
              <div
                key={i}
                className={`calendar-day ${!isSameMonth(d, currentMonth) ? 'other-month' : ''} ${isSameDay(d, new Date()) ? 'today' : ''}`}
              >
                {format(d, 'd')}
                {hasPost && <span className="calendar-dot" />}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // ── Post Card Render ────────────────────────────────────
  const renderPostCard = (post) => (
    <div key={post.id} className="card post-card animate-in">
      <div className="post-card-body">
        <div className="post-card-target">
          {post.target_chat || 'No target'}
          <span className={`badge badge-${post.status}`}>{post.status}</span>
        </div>
        <div className="post-card-text">
          {post.content_text || '(Image only)'}
        </div>
        <div className="post-card-meta">
          <span><FiClock size={12} /> {post.scheduled_time ? format(parseISO(post.scheduled_time), 'MMM d, h:mm a') : '—'}</span>
          {post.retry_count > 0 && <span><FiRefreshCw size={12} /> {post.retry_count} retries</span>}
          {post.repeat_weekly ? <span>🔁 Weekly</span> : null}
        </div>
      </div>
      <div className="post-card-actions">
        {(post.status === 'scheduled' || post.status === 'pending') && (
          <button className="btn btn-primary btn-sm" onClick={() => handleSendNow(post.id)} title="Send Now">
            <FiSend size={14} /> Send
          </button>
        )}
        {post.status !== 'posted' && (
          <button className="btn btn-ghost btn-icon btn-sm" onClick={() => handleDelete(post.id)} title="Delete">
            <FiTrash2 size={14} />
          </button>
        )}
      </div>
    </div>
  );

  if (loading) {
    return <div className="card empty-state" style={{ padding: '4rem' }}><p style={{ animation: 'pulse 1.5s infinite' }}>Loading dashboard...</p></div>;
  }

  const scheduledPosts = posts.filter(p => ['scheduled', 'pending'].includes(p.status));
  const historyPosts = posts.filter(p => ['posted', 'failed'].includes(p.status));

  return (
    <div>
      {/* Page Header */}
      <div className="page-header animate-in">
        <h1 className="gradient-text">Dashboard</h1>
        <div className="header-actions">
          <div className={`toggle-switch ${autoMode ? 'active' : ''}`} onClick={toggleAutoMode} title={autoMode ? 'Auto Mode' : 'Manual Mode'}>
            <FiZap size={14} />
            <span style={{ fontSize: '0.8rem' }}>{autoMode ? 'Auto' : 'Manual'}</span>
            <div className="toggle-track" />
          </div>
          <button className="theme-toggle" onClick={themeToggle}>
            {theme === 'dark' ? <FiSun /> : <FiMoon />}
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="stats-grid">
        <div className="card stat-card stat-scheduled animate-in animate-delay-1">
          <div className="stat-icon"><FiClock /></div>
          <div className="stat-value">{stats.scheduled || 0}</div>
          <div className="stat-label">Scheduled</div>
        </div>
        <div className="card stat-card stat-posted animate-in animate-delay-2">
          <div className="stat-icon"><FiCheckCircle /></div>
          <div className="stat-value">{stats.postedToday || 0}</div>
          <div className="stat-label">Sent Today</div>
        </div>
        <div className="card stat-card stat-pending animate-in animate-delay-3">
          <div className="stat-icon"><FiZap /></div>
          <div className="stat-value">{stats.pending || 0}</div>
          <div className="stat-label">Pending</div>
        </div>
        <div className="card stat-card stat-failed animate-in animate-delay-4">
          <div className="stat-icon"><FiAlertCircle /></div>
          <div className="stat-value">{stats.failed || 0}</div>
          <div className="stat-label">Failed</div>
        </div>
      </div>

      {/* Calendar */}
      {renderCalendar()}

      {/* Queue + History */}
      <div className="dashboard-grid">
        <div>
          <div className="section-header">
            <FiClock />
            <h2>Queue</h2>
            <span className="section-count">{scheduledPosts.length}</span>
          </div>
          {scheduledPosts.length === 0 ? (
            <div className="card empty-state">
              <FiFileText size={40} />
              <p>No posts in queue</p>
            </div>
          ) : scheduledPosts.map(renderPostCard)}
        </div>

        <div>
          <div className="section-header">
            <FiCheckCircle />
            <h2>History</h2>
            <span className="section-count">{historyPosts.length}</span>
          </div>
          {historyPosts.length === 0 ? (
            <div className="card empty-state">
              <FiCheckCircle size={40} />
              <p>No history yet</p>
            </div>
          ) : historyPosts.slice(0, 10).map(renderPostCard)}
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`toast toast-${toast.type}`}>
          {toast.type === 'success' ? <FiCheckCircle /> : <FiAlertCircle />}
          {toast.message}
        </div>
      )}
    </div>
  );
};

export default Dashboard;
