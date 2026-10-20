// Saved sign-ins, so tests start already logged in (the login endpoint is rate limited).
const fs = require('fs');
const path = require('path');
const env = require('./env');

const AUTH_DIR = path.join(__dirname, '..', '.auth');
const statePath = (role) => path.join(AUTH_DIR, `${role}.json`);

function saveState(role, token) {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
  const state = { cookies: [], origins: [{ origin: env.FRONTEND_URL, localStorage: [{ name: env.TOKEN_KEY, value: token }] }] };
  fs.writeFileSync(statePath(role), JSON.stringify(state, null, 2));
  fs.writeFileSync(path.join(AUTH_DIR, `${role}.token`), token);
}

const tokenFor = (role) => fs.readFileSync(path.join(AUTH_DIR, `${role}.token`), 'utf8');

module.exports = { statePath, saveState, tokenFor };
