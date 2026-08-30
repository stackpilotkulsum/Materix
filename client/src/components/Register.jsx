import { useState } from 'react';
import { useGoogleLogin } from '@react-oauth/google';
import api from '../api';
import { UserPlus, LogIn, ShieldAlert } from 'lucide-react';

const Register = ({ onToggle, setToken }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      await api.post('/api/auth/register', { username, password });
      setSuccess(true);
      setTimeout(() => onToggle(), 2000);
    } catch (err) {
      setError(
        err.response?.data?.message ||
        err.message ||
        'Registration failed. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleRegister = useGoogleLogin({
    onSuccess: async (codeResponse) => {
      setError('');
      setLoading(true);
      try {
        const response = await api.post('/api/auth/google-register', {
          credential: codeResponse.access_token
        });
        localStorage.setItem('material_token', response.data.token);
        setToken(response.data.token);
      } catch (err) {
        setError(
          err.response?.data?.message ||
          'Google registration failed. Please try again.'
        );
      } finally {
        setLoading(false);
      }
    },
    onError: () => {
      setError('Google registration failed. Please try again.');
    },
    flow: 'implicit'
  });

  if (success) {
    return (
      <div className="auth-card success">
        <div className="auth-header">
          <div className="auth-icon-container success">
            <UserPlus size={40} color="#10b981" />
          </div>
          <h2>Registration Successful</h2>
          <p>Redirecting to login...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-card">
      <div className="auth-header">
        <div className="auth-icon-container">
          <ShieldAlert size={40} color="var(--primary)" />
        </div>
        <h2>Create Account</h2>
        <p>Join Materix to secure your documents</p>
      </div>

      {error && <div className="auth-error">{error}</div>}

      <form onSubmit={handleSubmit} className="auth-form">
        <div className="form-group">
          <label>Username</label>
          <input 
            type="text" 
            placeholder="Choose a username"
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
        <div className="form-group">
          <label>Confirm Password</label>
          <input 
            type="password" 
            placeholder="••••••••"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
          />
        </div>
        <button type="submit" className="btn-primary auth-submit" disabled={loading}>
          {loading ? 'Creating Account...' : <><UserPlus size={18} /> Register</>}
        </button>
      </form>

      <div className="auth-divider">
        <span>or</span>
      </div>

      <button 
        type="button" 
        className="btn-google auth-submit"
        onClick={() => handleGoogleRegister()}
        disabled={loading}
      >
        <svg className="google-icon" viewBox="0 0 24 24" width="18" height="18">
          <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
          <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
          <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
          <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
        </svg>
        Sign up with Google
      </button>

      <div className="auth-footer">
        <span>Already have an account?</span>
        <button className="auth-toggle-btn" onClick={onToggle}>
          <LogIn size={16} /> Sign In
        </button>
      </div>
    </div>
  );
};

export default Register;
