import axios from 'axios';

const baseURL = (() => {
  const envUrl = import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL;
  if (envUrl) return envUrl.replace(/\/+$/, '');

  if (import.meta.env.DEV || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return 'http://localhost:5000';
  }

  const productionFallback = 'https://materialmate-backend-hp03.onrender.com';
  return productionFallback;
})();

const api = axios.create({
  baseURL,
});

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('material_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

export const getDownloadUrl = (url) => {
  if (!url) return '#';
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  
  const serverBase = (baseURL || 'http://localhost:5000').replace(/\/+$/, '');
  const cleanPath = url.startsWith('/') ? url : `/${url}`;
  
  return `${serverBase}${cleanPath}`;
};

export default api;
