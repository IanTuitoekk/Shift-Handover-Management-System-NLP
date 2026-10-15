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
      onUnauthorized(error.response?.data?.error);
    }
    return Promise.reject(error);
  },
);

export const api = {
  login: (email, password) => client.post('/auth/login', { email, password }).then((r) => r.data),
  register: (payload) => client.post('/auth/register', payload).then((r) => r.data),
  logout: () => client.post('/auth/logout').then((r) => r.data),
  me: () => client.get('/auth/me').then((r) => r.data),
  forgotPassword: (email) => client.post('/auth/forgot-password', { email }).then((r) => r.data),
  resetPassword: (token, newPassword) =>
    client.post('/auth/reset-password', { token, new_password: newPassword }).then((r) => r.data),
  changePassword: (currentPassword, newPassword) =>
    client.post('/auth/change-password', { current_password: currentPassword, new_password: newPassword }).then((r) => r.data),

  /** Filters: submitted_by, shift, category, review, min_confidence, max_confidence, from, to, sort. */
  listReports: ({ limit, offset, submittedBy, ...filters }) =>
    client
      .get('/handovers', { params: { limit, offset, ...(submittedBy ? { submitted_by: submittedBy } : {}), ...filters } })
      .then((r) => r.data),
  overviewStats: (shifts) => client.get('/stats/overview', { params: { shifts } }).then((r) => r.data),
  recurringEntities: (params) => client.get('/insights/entities', { params }).then((r) => r.data),
  shiftConfig: () => client.get('/config/shifts').then((r) => r.data),
  getReport: (reportId) => client.get(`/handovers/${reportId}`).then((r) => r.data),
  submitHandover: (payload) => client.post('/handovers', payload).then((r) => r.data),

  listTasks: (status) => client.get('/tasks', { params: status ? { status } : {} }).then((r) => r.data),
  resolveTask: (taskId) => client.patch(`/tasks/${taskId}/resolve`).then((r) => r.data),
  assignTask: (taskId, assignedTo) =>
    client.patch(`/tasks/${taskId}/assign`, { assigned_to: assignedTo }).then((r) => r.data),

  listUsers: () => client.get('/users').then((r) => r.data),
  setTaskDue: (taskId, dueAt) => client.patch(`/tasks/${taskId}/due`, { due_at: dueAt }).then((r) => r.data),
  listDirectory: () => client.get('/users/directory').then((r) => r.data),
  workload: (since) => client.get('/users/workload', { params: since ? { since } : {} }).then((r) => r.data),
  updateUser: (userId, changes) => client.patch(`/users/${userId}`, changes).then((r) => r.data),
  setUserRole: (userId, role) => client.patch(`/users/${userId}/role`, { role }).then((r) => r.data),
  setUserActive: (userId, active, reason) =>
    client.patch(`/users/${userId}/active`, { active, ...(reason ? { reason } : {}) }).then((r) => r.data),
  deleteUser: (userId) => client.delete(`/users/${userId}`).then((r) => r.data),

  listNotifications: () => client.get('/notifications').then((r) => r.data),
  markNotificationRead: (notifId) => client.patch(`/notifications/${notifId}/read`).then((r) => r.data),
  markNotificationsRead: (notifIds) => client.patch('/notifications/read', { notif_ids: notifIds }).then((r) => r.data),
};
