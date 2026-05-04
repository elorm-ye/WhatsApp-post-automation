import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { FiSettings, FiWifi, FiZap, FiShield, FiRefreshCw, FiMoon, FiSun, FiCheckCircle, FiAlertCircle } from 'react-icons/fi';
import { FaWhatsapp } from 'react-icons/fa';

const API = 'http://localhost:3001/api';

const Settings = ({ themeToggle, theme }) => {
  const [settings, setSettings] = useState(null);
  const [waStatus, setWaStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [toast, setToast] = useState(null);

  const showToast = (msg, type = 'success') => {
    setToast({ message: msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const [settingsRes, statusRes] = await Promise.all([
          axios.get(`${API}/settings`),
          axios.get(`${API}/whatsapp/status`)
        ]);
        setSettings(settingsRes.data);
        setWaStatus(statusRes.data);
      } catch (err) {
        console.error('Settings fetch error:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchSettings();
  }, []);

  const toggleAutoMode = async () => {
    try {
      const res = await axios.post(`${API}/settings`, { autoMode: !settings.autoMode });
      setSettings(prev => ({ ...prev, autoMode: res.data.autoMode }));
      showToast(`${res.data.autoMode ? 'Auto' : 'Manual'} mode enabled`);
    } catch (err) {
      showToast('Failed to update', 'error');
    }
  };

  const refreshWhatsAppStatus = async () => {
    setRefreshing(true);
    try {
      const res = await axios.get(`${API}/whatsapp/status`);
      setWaStatus(res.data);
      if (res.data.ready && res.data.sessionValid) {
        showToast('WhatsApp is connected!');
      } else if (res.data.initialized) {
        showToast('Browser running, but session not active yet. Scan QR code.', 'warning');
      } else {
        showToast('WhatsApp browser not started', 'error');
      }
    } catch (err) {
      showToast('Failed to check status', 'error');
    } finally {
      setRefreshing(false);
    }
  };

  if (loading) {
    return <div className="card empty-state" style={{ padding: '4rem' }}><p>Loading settings...</p></div>;
  }

  return (
    <div>
      <div className="page-header animate-in">
        <h1 className="gradient-text">Settings</h1>
        <div className="header-actions">
          <button className="theme-toggle" onClick={themeToggle}>
            {theme === 'dark' ? <FiSun /> : <FiMoon />}
          </button>
        </div>
      </div>

      <div className="settings-grid">
        {/* WhatsApp Connection */}
        <div className="card settings-card animate-in animate-delay-1">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ margin: 0 }}><FaWhatsapp color="var(--primary)" /> WhatsApp Connection</h3>
            <button
              className="btn btn-ghost btn-sm"
              onClick={refreshWhatsAppStatus}
              disabled={refreshing}
              title="Check if QR code has been scanned"
            >
              <FiRefreshCw size={14} style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
              {refreshing ? 'Checking...' : 'Refresh'}
            </button>
          </div>
          <div className="setting-row">
            <span className="setting-label">Browser</span>
            <span className="setting-value" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <span className={`online-dot ${waStatus?.initialized ? 'online' : 'offline'}`} />
              {waStatus?.initialized ? 'Running' : 'Not started'}
            </span>
          </div>
          <div className="setting-row">
            <span className="setting-label">Session</span>
            <span className="setting-value" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              {waStatus?.sessionValid
                ? <><FiCheckCircle color="var(--success)" size={14} /> Active</>
                : <><FiAlertCircle color="var(--danger)" size={14} /> Inactive</>
              }
            </span>
          </div>
          <div className="setting-row">
            <span className="setting-label">Status</span>
            <span className="setting-value">
              {waStatus?.ready ? '✅ Ready' : '⏳ Waiting for QR scan'}
            </span>
          </div>
          {!waStatus?.sessionValid && (
            <div style={{ marginTop: '1rem' }}>
              <button
                className="btn btn-primary"
                style={{ width: '100%' }}
                onClick={async () => {
                  try {
                    await axios.post(`${API}/whatsapp/focus`);
                    showToast('WhatsApp browser opened — scan the QR code!');
                  } catch (err) {
                    showToast(err.response?.data?.error || 'Could not open WhatsApp browser', 'error');
                  }
                }}
              >
                <FaWhatsapp size={16} /> Open & Pair WhatsApp
              </button>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.5rem', textAlign: 'center' }}>
                Opens the Chromium browser with WhatsApp Web — scan the QR code from your phone, then click Refresh.
              </p>
            </div>
          )}
          {waStatus?.sessionValid && (
            <div style={{ marginTop: '1rem', textAlign: 'center' }}>
              <span className="badge badge-posted" style={{ fontSize: '0.8rem', padding: '0.4rem 1rem' }}>
                ✅ WhatsApp Paired Successfully
              </span>
            </div>
          )}
        </div>

        {/* Posting Mode */}
        <div className="card settings-card animate-in animate-delay-2">
          <h3><FiZap /> Posting Mode</h3>
          <div className="setting-row">
            <span className="setting-label">Auto Post</span>
            <div className={`toggle-switch ${settings?.autoMode ? 'active' : ''}`} onClick={toggleAutoMode}>
              <div className="toggle-track" />
            </div>
          </div>
          <div className="setting-row">
            <span className="setting-label">Current Mode</span>
            <span className={`badge ${settings?.autoMode ? 'badge-posted' : 'badge-pending'}`}>
              {settings?.autoMode ? 'AUTO' : 'MANUAL'}
            </span>
          </div>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
            {settings?.autoMode
              ? 'Posts will be sent automatically when their scheduled time arrives.'
              : 'Posts will be marked as pending. You must click "Send Now" to trigger them.'}
          </p>
        </div>

        {/* Safety & Limits */}
        <div className="card settings-card animate-in animate-delay-3">
          <h3><FiShield /> Safety & Limits</h3>
          <div className="setting-row">
            <span className="setting-label">Rate Limit</span>
            <span className="setting-value">{(settings?.rateLimitMs || 30000) / 1000}s between sends</span>
          </div>
          <div className="setting-row">
            <span className="setting-label">Max Retries</span>
            <span className="setting-value">{settings?.maxRetries || 3} attempts</span>
          </div>
          <div className="setting-row">
            <span className="setting-label">Backoff</span>
            <span className="setting-value">Exponential (30s × 2ⁿ)</span>
          </div>
        </div>

        {/* System Info */}
        <div className="card settings-card animate-in animate-delay-4">
          <h3><FiRefreshCw /> System Info</h3>
          <div className="setting-row">
            <span className="setting-label">Database</span>
            <span className="setting-value">SQLite (local)</span>
          </div>
          <div className="setting-row">
            <span className="setting-label">Scheduler</span>
            <span className="setting-value">node-cron (every 1 min)</span>
          </div>
          <div className="setting-row">
            <span className="setting-label">Automation</span>
            <span className="setting-value">Playwright (Chromium)</span>
          </div>
          <div className="setting-row">
            <span className="setting-label">Network</span>
            <span className="setting-value" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <FiWifi size={14} /> {navigator.onLine ? 'Online' : 'Offline'}
            </span>
          </div>
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

export default Settings;
