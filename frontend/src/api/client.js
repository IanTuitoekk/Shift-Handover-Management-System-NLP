import axios from 'axios';
import { API_URL } from '../config';

const TOKEN_KEY = 'kq-handover-token';

export const tokenStore = {
  get() {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set(token) {
    try {
      localStorage.setItem(TOKEN_KEY, token);
    } catch {
      // Storage unavailable (private mode); session lasts until reload.
    }
  },
  clear() {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {
      // ignore
    }
  },
};

const client = axios.create({ baseURL: API_URL });

let onUnauthorized = () => {};
export function setUnauthorizedHandler(handler) {
  onUnauthorized = handler;
}

client.interceptors.request.use((config) => {
  const token = tokenStore.get();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

client.interceptors.response.use(
  (response) => response,
  (error) => {
    const isAuthCall = error.config?.url?.startsWith('/auth/login') || error.config?.url?.startsWith('/auth/register');
    if (error.response?.status === 401 && !isAuthCall) {
      tokenStore.clear();
      onUnauthorized();
    }
    return Promise.reject(error);
  },
);

export const api = {
  login: (email, password) => client.post('/auth/login', { email, password }).then((r) => r.data),
  register: (payload) => client.post('/auth/register', payload).then((r) => r.data),
  logout: () => client.post('/auth/logout').then((r) => r.data),
  me: () => client.get('/auth/me').then((r) => r.data),

  listReports: ({ limit, offset }) =>
    client.get('/handovers', { params: { limit, offset } }).then((r) => r.data),
  getReport: (reportId) => client.get(`/handovers/${reportId}`).then((r) => r.data),
  submitHandover: (payload) => client.post('/handovers', payload).then((r) => r.data),

  listTasks: (status) => client.get('/tasks', { params: status ? { status } : {} }).then((r) => r.data),
  resolveTask: (taskId) => client.patch(`/tasks/${taskId}/resolve`).then((r) => r.data),
  assignTask: (taskId, assignedTo) =>
    client.patch(`/tasks/${taskId}/assign`, { assigned_to: assignedTo }).then((r) => r.data),

  listNotifications: () => client.get('/notifications').then((r) => r.data),
  markNotificationRead: (notifId) => client.patch(`/notifications/${notifId}/read`).then((r) => r.data),
};
