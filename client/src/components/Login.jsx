import { useState } from 'react';
import api from '../api';
import { supabase } from '../supabase';
import { LogIn, UserPlus, ShieldCheck } from 'lucide-react';

const authRedirectUrl =
  import.meta.env.VITE_AUTH_REDIRECT_URL ||
  (import.meta.env.PROD ? 'https://material-mate.vercel.app' : window.location.origin);

const Login = ({ setToken, onToggle }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const response = await api.post('/api/auth/login', { username, password });
      localStorage.setItem('material_token', response.data.token);
      setToken(response.data.token);
    } catch (err) {
      setError(
        err.response?.data?.message ||
        err.message ||
        'Login failed. Please check your credentials.'
      );
    } finally {
      setLoading(false);
    }
  };



  const handleSupabaseGoogleLogin = async () => {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: authRedirectUrl
        }
      });
      if (error) throw error;
    } catch (err) {
      setError(err.message || 'Google login failed');
    }
  };

  return (
    <div className="auth-card">
      <div className="auth-header">
        <div className="auth-icon-container">
          <ShieldCheck size={40} color="var(--primary)" />
        </div>
        <h2>Welcome Back</h2>
        <p>Login to access your secure material vault</p>
      </div>

      {error && <div className="auth-error">{error}</div>}

      <form onSubmit={handleSubmit} className="auth-form">
        <div className="form-group">
          <label>Username</label>
          <input 
            type="text" 
            placeholder="Enter your username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
        </div>
        <div className="form-group">
          <label>Password</label>
          <input 
            type="password" 
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        <button type="submit" className="btn-primary auth-submit" disabled={loading}>
          {loading ? 'Authenticating...' : <><LogIn size={18} /> Login</>}
        </button>
      </form>

      <div className="auth-divider">
        <span>or</span>
      </div>

      <button 
        type="button" 
        className="btn-google auth-submit"
        onClick={handleSupabaseGoogleLogin}
        disabled={loading}
      >
        <svg className="google-icon" viewBox="0 0 24 24" width="18" height="18">
          <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
          <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
          <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
          <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
        </svg>
        Login with Google
      </button>

      <div className="auth-footer">
        <span>Don't have an account?</span>
        <button className="auth-toggle-btn" onClick={onToggle}>
          <UserPlus size={16} /> Create Account
        </button>
      </div>
    </div>
  );
};

export default Login;
