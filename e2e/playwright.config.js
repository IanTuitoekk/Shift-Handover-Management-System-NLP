// End-to-end tests: real browser, real frontend and backend, a separate database, and a fake
// inference service (deterministic, no ML models). Run from e2e/: `npm test`.
const { defineConfig, devices } = require('@playwright/test');
const env = require('./support/env');

module.exports = defineConfig({
  testDir: './tests',
  // One backend and one database are shared, and tests change data, so run in order.
  workers: 1,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: env.FRONTEND_URL,
    // Traces only on a retry (CI retries once). Recording on every run made closing extra browser
    // windows fail now and then with missing trace files.
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    permissions: ['microphone'],
    launchOptions: {
      // A fake microphone (a tone) so voice input can be tested without a person.
      args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
    },
  },
  projects: [
    { name: 'setup', testMatch: /setup\.js/ },
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['setup'],
      testIgnore: /mobile\.spec\.js/,
    },
    {
      name: 'mobile',
      use: { ...devices['Pixel 7'] },
      dependencies: ['setup'],
      testMatch: /mobile\.spec\.js/,
    },
  ],
  webServer: [
    {
      command: 'node support/fake-inference.js',
      url: `http://localhost:${env.INFERENCE_PORT}/health`,
      reuseExistingServer: false,
      env: { PORT: String(env.INFERENCE_PORT) },
    },
    {
      // Rebuilds the e2e database from schema + migrations + seed, then starts the API on it.
      command: 'node scripts/reset-test-db.js && node bin/www',
      cwd: `${env.ROOT}/backend`,
      url: `http://localhost:${env.BACKEND_PORT}/health`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        PORT: String(env.BACKEND_PORT),
        DB_NAME: env.E2E_DB,
        TEST_DB_NAME: env.E2E_DB,
        INFERENCE_SERVICE_URL: `http://localhost:${env.INFERENCE_PORT}`,
        FRONTEND_ORIGIN: env.FRONTEND_URL,
        FRONTEND_URL: env.FRONTEND_URL,
        GOOGLE_CLIENT_ID: 'e2e-fake-client-id.apps.googleusercontent.com',
        SMTP_HOST: '',
      },
    },
    {
      command: `npm run dev -- --port ${env.FRONTEND_PORT} --strictPort`,
      cwd: `${env.ROOT}/frontend`,
      url: env.FRONTEND_URL,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        VITE_API_URL: env.API_URL,
        VITE_GOOGLE_CLIENT_ID: 'e2e-fake-client-id.apps.googleusercontent.com',
      },
    },
  ],
});
