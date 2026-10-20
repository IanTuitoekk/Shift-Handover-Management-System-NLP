// Ports and names for the end-to-end run. Everything runs beside the dev app (5173/3000/8000)
// without touching it: own ports, own database, fake inference service.
const path = require('path');
const dotenv = require('dotenv');

const ROOT = path.resolve(__dirname, '..', '..');
const backendEnv = dotenv.config({ path: path.join(ROOT, 'backend', '.env'), processEnv: {} }).parsed ?? {};

// backend/.env locally; plain environment variables on CI (where there is no .env file).
const E2E_DB = process.env.E2E_DB_NAME || `${backendEnv.DB_NAME || process.env.DB_NAME || 'shift_handover'}_e2e_test`;

module.exports = {
  ROOT,
  E2E_DB,
  FRONTEND_PORT: 5174,
  BACKEND_PORT: 3100,
  INFERENCE_PORT: 8100,
  FRONTEND_URL: 'http://localhost:5174',
  API_URL: 'http://localhost:3100/api',
  TOKEN_KEY: 'kq-handover-token',
  PASSWORD: 'e2epass123',
  // Accounts created by tests/setup.js.
  USERS: {
    supervisor: { full_name: 'Esther Supervisor', email: 'e2e-supervisor@kenya-airways.com' },
    crew: { full_name: 'Juma Crew', email: 'e2e-crew@kenya-airways.com' },
    crew2: { full_name: 'Amina Second', email: 'e2e-crew2@kenya-airways.com' },
  },
};
