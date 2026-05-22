import axios from 'axios';

const baseURL = (() => {
  const envUrl = import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL;
  if (envUrl) return envUrl;

  if (import.meta.env.DEV) {
    return 'http://localhost:5000';
  }

  // If we are serving the production build locally from port 5000, we should just use relative path
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return ''; // use relative path so it hits localhost:5000
  }

  const productionFallback = 'https://materialmate-backend-hp03.onrender.com';
  return productionFallback;
})();

const api = axios.create({
  baseURL,
});

export default api;
