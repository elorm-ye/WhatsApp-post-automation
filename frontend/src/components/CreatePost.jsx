import React, { useState, useRef } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { FiImage, FiCalendar, FiMessageSquare, FiUser, FiSend, FiSave, FiUploadCloud, FiX, FiMoon, FiSun, FiRepeat } from 'react-icons/fi';

const API = 'http://localhost:3001/api';

const CreatePost = ({ themeToggle, theme }) => {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  const [formData, setFormData] = useState({
    targetChat: '',
    text: '',
    scheduledTime: '',
    platform: 'whatsapp',
    repeatWeekly: false
  });
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [toast, setToast] = useState(null);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleFileSelect = (selectedFile) => {
    if (selectedFile && (selectedFile.type.startsWith('image/') || selectedFile.type.startsWith('video/'))) {
      setFile(selectedFile);
    }
  };

  // ── Drag & Drop ───────────────────────────────────────
  const handleDragOver = (e) => { e.preventDefault(); setDragging(true); };
  const handleDragLeave = () => setDragging(false);
  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files.length > 0) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  // ── Min datetime ──────────────────────────────────────
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  const minDateTime = now.toISOString().slice(0, 16);

  // ── Submit Helpers ────────────────────────────────────
  const buildFormData = (overrides = {}) => {
    const data = new FormData();
    data.append('targetChat', overrides.targetChat || formData.targetChat);
    data.append('text', formData.text);
    data.append('platform', formData.platform);
    data.append('repeatWeekly', formData.repeatWeekly ? '1' : '0');

    if (overrides.scheduledTime) {
      data.append('scheduledTime', overrides.scheduledTime);
    } else if (formData.scheduledTime) {
      data.append('scheduledTime', new Date(formData.scheduledTime).toISOString());
    }

    if (overrides.status) {
      data.append('status', overrides.status);
    }

    if (file) {
      data.append('media', file);
    }

    return data;
  };

  const handleSchedule = async (e) => {
    e.preventDefault();
    if (!formData.targetChat || (!formData.text && !file) || !formData.scheduledTime) {
      showToast('Fill all required fields', 'error');
      return;
    }
    setLoading(true);
    try {
      await axios.post(`${API}/posts`, buildFormData(), {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      showToast('Post scheduled!');
      setTimeout(() => navigate('/'), 500);
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to schedule', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handlePostNow = async () => {
    if (!formData.targetChat || (!formData.text && !file)) {
      showToast('Fill target chat and provide text or image', 'error');
      return;
    }
    setLoading(true);
    try {
      const data = buildFormData({ scheduledTime: new Date().toISOString() });
      const res = await axios.post(`${API}/posts`, data, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      await axios.post(`${API}/posts/${res.data.id}/send`);
      showToast('Message sent!');
      setTimeout(() => navigate('/'), 500);
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to send', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveDraft = async () => {
    setLoading(true);
    try {
      const data = buildFormData({ status: 'draft' });
      await axios.post(`${API}/posts`, data, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      showToast('Draft saved!');
      setTimeout(() => navigate('/'), 500);
    } catch (err) {
      showToast('Failed to save draft', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      {/* Page Header */}
      <div className="page-header animate-in">
        <h1 className="gradient-text">Create Post</h1>
        <div className="header-actions">
          <button className="theme-toggle" onClick={themeToggle}>
            {theme === 'dark' ? <FiSun /> : <FiMoon />}
          </button>
        </div>
      </div>

      <div className="card form-card animate-in animate-delay-1">
        <form onSubmit={handleSchedule}>
          {/* Target Chat */}
          <div className="form-group">
            <label><FiUser size={14} /> Target Chat</label>
            <input
              type="text"
              name="targetChat"
              className="form-control"
              value={formData.targetChat}
              onChange={handleChange}
              placeholder="Contact name or group name"
            />
            <small style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
              Must match the chat name exactly as it appears in WhatsApp
            </small>
          </div>

          {/* Message */}
          <div className="form-group">
            <label><FiMessageSquare size={14} /> Message</label>
            <textarea
              name="text"
              className="form-control"
              value={formData.text}
              onChange={handleChange}
              placeholder="Type your message here..."
              rows="4"
            />
          </div>

          <div className="form-row">
            {/* Schedule Time */}
            <div className="form-group">
              <label><FiCalendar size={14} /> Schedule Time</label>
              <input
                type="datetime-local"
                name="scheduledTime"
                className="form-control"
                value={formData.scheduledTime}
                onChange={handleChange}
                min={minDateTime}
              />
            </div>

            {/* Platform */}
            <div className="form-group">
              <label>Platform</label>
              <select name="platform" className="form-control" value={formData.platform} onChange={handleChange}>
                <option value="whatsapp">WhatsApp</option>
                <option value="telegram" disabled>Telegram (coming soon)</option>
                <option value="instagram" disabled>Instagram (coming soon)</option>
              </select>
            </div>
          </div>

          {/* Weekly Repeat */}
          <div className="form-group">
            <label style={{ cursor: 'pointer' }}>
              <input
                type="checkbox"
                name="repeatWeekly"
                checked={formData.repeatWeekly}
                onChange={handleChange}
                style={{ marginRight: '0.5rem' }}
              />
              <FiRepeat size={14} /> Repeat Weekly
            </label>
          </div>

          {/* Dropzone */}
          <div className="form-group">
            <label><FiImage size={14} /> Attach Media (Optional)</label>
            <div
              className={`dropzone ${dragging ? 'dragging' : ''}`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <FiUploadCloud size={32} />
              <p>Drag & drop an image or video here, or click to browse</p>
              {file && (
                <div className="file-name" onClick={(e) => { e.stopPropagation(); setFile(null); }}>
                  {file.name} <FiX style={{ verticalAlign: 'middle', cursor: 'pointer' }} />
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/*"
                onChange={(e) => handleFileSelect(e.target.files[0])}
                style={{ display: 'none' }}
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem', flexWrap: 'wrap' }}>
            <button type="submit" className="btn btn-primary" disabled={loading} style={{ flex: 1 }}>
              <FiCalendar size={16} /> {loading ? 'Scheduling...' : 'Schedule'}
            </button>
            <button type="button" className="btn btn-primary" disabled={loading} onClick={handlePostNow}
              style={{ flex: 1, background: 'linear-gradient(135deg, #075E54, #128C7E)' }}>
              <FiSend size={16} /> {loading ? 'Sending...' : 'Post Now'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={handleSaveDraft} disabled={loading}>
              <FiSave size={16} /> Draft
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => navigate('/')}>
              Cancel
            </button>
          </div>
        </form>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`toast toast-${toast.type}`}>
          {toast.message}
        </div>
      )}
    </div>
  );
};

export default CreatePost;
