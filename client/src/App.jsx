import React, { useCallback, useState, useEffect } from 'react';
import Header from './components/Header';
import UploadZone from './components/UploadZone';
import FileHistory from './components/FileHistory';
import ExtractedData from './components/ExtractedData';
import Settings from './components/Settings';
import Login from './components/Login';
import Register from './components/Register';
import { supabase } from './supabase';
import api from './api';
import './App.css';

const getJwtExpiryTime = (token) => {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;

    const normalizedPayload = payload.replace(/-/g, '+').replace(/_/g, '/');
    const decodedPayload = JSON.parse(
      window.atob(normalizedPayload.padEnd(Math.ceil(normalizedPayload.length / 4) * 4, '='))
    );

    return decodedPayload.exp ? decodedPayload.exp * 1000 : null;
  } catch (error) {
    console.error('Could not read session expiry:', error);
    return null;
  }
};

function App() {
  const [token, setToken] = useState(localStorage.getItem('material_token'));
  const [currentView, setCurrentView] = useState('login'); // 'login', 'register', 'app'
  const [refreshHistory, setRefreshHistory] = useState(0);
  const [currentTab, setCurrentTab] = useState('upload');
  const [sessionNotice, setSessionNotice] = useState('');

  const clearSession = useCallback(async ({ expired = false } = {}) => {
    localStorage.removeItem('material_token');
    setToken(null);
    setCurrentView('login');
    setSessionNotice(expired ? 'Your session expired after 1 minute. Please login again.' : '');

    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.error('Supabase sign out failed:', error);
    }
  }, []);

  useEffect(() => {
    // Check URL for token (from Google OAuth redirect)
    const urlParams = new URLSearchParams(window.location.search);
    const urlToken = urlParams.get('token');
    if (urlToken) {
      localStorage.setItem('material_token', urlToken);
      setToken(urlToken);
      // Clean up URL parameters
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  useEffect(() => {
    // Listen for Supabase auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session) {
        try {
          const response = await api.post('/api/auth/supabase-login', {
            accessToken: session.access_token
          });
          localStorage.setItem('material_token', response.data.token);
          setToken(response.data.token);
          setSessionNotice('');
        } catch (error) {
          console.error('Supabase session exchange failed:', error);
          const errorMsg = error.response?.data?.message || error.message || 'Unknown login error';
          setSessionNotice(`Login blocked by server: ${errorMsg}`);
          localStorage.removeItem('material_token');
          setToken(null);
          await supabase.auth.signOut();
        }
      } else if (event === 'SIGNED_OUT') {
        localStorage.removeItem('material_token');
        setToken(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (token) {
      setCurrentView('app');
      setSessionNotice('');
    } else {
      setCurrentView('login');
    }
  }, [token]);

  useEffect(() => {
    if (!token) return undefined;

    const expiresAt = getJwtExpiryTime(token);
    if (!expiresAt) {
      clearSession({ expired: true });
      return undefined;
    }

    const timeUntilExpiry = expiresAt - Date.now();
    if (timeUntilExpiry <= 0) {
      clearSession({ expired: true });
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      clearSession({ expired: true });
    }, timeUntilExpiry);

    return () => window.clearTimeout(timeoutId);
  }, [token, clearSession]);

  // Inactivity session handling (1 minute)
  useEffect(() => {
    if (!token) return undefined;

    let inactivityTimeout;
    const INACTIVITY_LIMIT = 30 * 60 * 1000; // 1 minute

    const resetTimeout = () => {
      window.clearTimeout(inactivityTimeout);
      inactivityTimeout = window.setTimeout(() => {
        clearSession({ expired: true });
      }, INACTIVITY_LIMIT);
    };

    const activityEvents = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart'];
    
    resetTimeout(); // Initialize

    activityEvents.forEach(event => {
      window.addEventListener(event, resetTimeout);
    });

    return () => {
      window.clearTimeout(inactivityTimeout);
      activityEvents.forEach(event => {
        window.removeEventListener(event, resetTimeout);
      });
    };
  }, [token, clearSession]);

  const handleLogout = () => {
    clearSession();
  };

  const triggerRefresh = () => {
    setRefreshHistory(prev => prev + 1);
  };

  if (currentView === 'login') {
    return (
      <div className="auth-container">
        <div className="auth-stack">
          {sessionNotice && <div className="auth-error session-notice">{sessionNotice}</div>}
          <Login setToken={setToken} onToggle={() => setCurrentView('register')} />
        </div>
      </div>
    );
  }

  if (currentView === 'register') {
    return (
      <div className="auth-container">
        <Register onToggle={() => setCurrentView('login')} setToken={setToken} />
      </div>
    );
  }

  return (
    <div className="app-container">
      <div className="bg-gradient"></div>
      <div className="bg-mesh"></div>
      
      <Header currentTab={currentTab} setCurrentTab={setCurrentTab} onLogout={handleLogout} />
      
      <main className="main-content">
        {currentTab === 'upload' && (
          <>
            <header className="hero">
              <div className="hero-kicker">Secure material workspace</div>
              <h1>Upload Your <span>Materials</span></h1>
              <p>Move files into a clean vault built for quick uploads, organized folders, searchable history, and safer document handling.</p>
              <div className="hero-stats" aria-label="Materix upload highlights">
                <div>
                  <strong>10 MB</strong>
                  <span>per file</span>
                </div>
                <div>
                  <strong>PDF / IMG</strong>
                  <span>DOCX, ZIP + Images</span>
                </div>
                <div>
                  <strong>UUID</strong>
                  <span>safe storage</span>
                </div>
              </div>
            </header>
            <UploadZone onUploadSuccess={triggerRefresh} />
          </>
        )}
        
        {currentTab === 'history' && (
          <FileHistory refreshTrigger={refreshHistory} />
        )}
 
        {currentTab === 'extracted' && (
          <ExtractedData />
        )}
 
        {currentTab === 'settings' && (
          <Settings />
        )}
      </main>
 
      <footer className="footer" style={{ textAlign: 'center', padding: '4rem 2rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
        <p>&copy; 2026 Materix. Built with React & Node.js.</p>
      </footer>
    </div>
  );
}

export default App;

