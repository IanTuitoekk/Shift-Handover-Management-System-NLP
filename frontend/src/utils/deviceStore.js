/*
 * Per-user state kept in this browser only: the composer draft and the list of handovers
 * submitted from this device. The API does not record who submitted a report, so the
 * personal timeline can only show submissions made here. Every access is guarded because
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
const submissionsKey = (userId) => `kq-submissions:${userId}`;
const MAX_SUBMISSIONS = 200;

export const draftStore = {
  load: (userId) => read(draftKey(userId), null),
  save: (userId, draft) => write(draftKey(userId), draft),
  clear: (userId) => write(draftKey(userId), null),
};

export const submissionStore = {
  list: (userId) => read(submissionsKey(userId), []),
  add(userId, entry) {
    const next = [entry, ...read(submissionsKey(userId), [])].slice(0, MAX_SUBMISSIONS);
    write(submissionsKey(userId), next);
    return next;
  },
};
