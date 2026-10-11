/*
 * Per-user state kept in this browser only: the composer draft. Every access is guarded because
 * storage can be unavailable (private mode, blocked site data).
 */

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

const draftKey = (userId) => `kq-draft:${userId}`;

export const draftStore = {
  load: (userId) => read(draftKey(userId), null),
  save: (userId, draft) => write(draftKey(userId), draft),
  clear: (userId) => write(draftKey(userId), null),
};

