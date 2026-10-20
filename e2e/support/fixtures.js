// Shared test helpers. Every page gets a stand-in for Google's sign-in script, so tests never
// depend on accounts.google.com (and can drive the Google button).
const { test: base, expect } = require('@playwright/test');
const env = require('./env');
const { statePath, tokenFor } = require('./session');

const GOOGLE_STUB = `
  window.google = { accounts: { id: {
    initialize(o) { window.__googleCallback = o.callback; },
    renderButton(el) {
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = 'Sign in with Google (test)'; b.id = 'fake-google-button';
      b.onclick = () => window.__googleCallback({ credential: 'e2e-google-credential' });
      el.appendChild(b);
    },
  } } };`;

const test = base.extend({
  context: async ({ context }, use) => {
    await context.route('https://accounts.google.com/gsi/client', (route) =>
      route.fulfill({ contentType: 'text/javascript', body: GOOGLE_STUB }),
    );
    await use(context);
  },
});

/** Calls the API as a role (supervisor, crew, crew2). */
async function api(request, role, method, path, data) {
  const res = await request.fetch(`${env.API_URL}${path}`, {
    method,
    data,
    headers: { Authorization: `Bearer ${tokenFor(role)}` },
  });
  return { status: res.status(), body: await res.json().catch(() => null) };
}

/** A unique marker for text a test creates, so it can find its own rows. */
const tag = (label) => `${label} ${Date.now().toString(36)}`;

module.exports = { test, expect, statePath, api, tag, env };
