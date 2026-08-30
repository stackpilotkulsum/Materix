import { useState } from 'react';
import api from '../api';
import { LogIn, UserPlus, ShieldCheck } from 'lucide-react';

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
