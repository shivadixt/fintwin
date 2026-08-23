import axios from 'axios';

const client = axios.create({
  baseURL: '/api',
});

// Request interceptor — attach JWT token
client.interceptors.request.use((config) => {
  const token = localStorage.getItem('ft_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor — handle 401
client.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      localStorage.removeItem('ft_token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default client;
