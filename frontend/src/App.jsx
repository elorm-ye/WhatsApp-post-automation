import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import Dashboard from './components/Dashboard';
import CreatePost from './components/CreatePost';
import Settings from './components/Settings';
import { FiHome, FiPlusSquare, FiSettings, FiMoon, FiSun } from 'react-icons/fi';
import { FaWhatsapp } from 'react-icons/fa';
import './App.css';

const Sidebar = () => {
  const location = useLocation();

  const links = [
    { to: '/', icon: <FiHome />, label: 'Dashboard' },
    { to: '/create', icon: <FiPlusSquare />, label: 'Create Post' },
  ];

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <FaWhatsapp size={24} />
        <span>WAPoster</span>
      </div>

      <nav className="sidebar-nav">
        {links.map(link => (
          <Link
            key={link.to}
            to={link.to}
            className={`nav-link ${location.pathname === link.to ? 'active' : ''}`}
          >
            {link.icon}
            <span>{link.label}</span>
          </Link>
        ))}
      </nav>

      <div className="sidebar-footer">
        <Link
          to="/settings"
          className={`nav-link ${location.pathname === '/settings' ? 'active' : ''}`}
        >
          <FiSettings />
          <span>Settings</span>
        </Link>
      </div>
    </aside>
  );
};

function App() {
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('waposter-theme') || 'dark';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('waposter-theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };

  return (
    <Router>
      <div className="app-layout">
        <Sidebar />
        <main className="main-content">
          <Routes>
            <Route path="/" element={<Dashboard themeToggle={toggleTheme} theme={theme} />} />
            <Route path="/create" element={<CreatePost themeToggle={toggleTheme} theme={theme} />} />
            <Route path="/settings" element={<Settings themeToggle={toggleTheme} theme={theme} />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;
