# Shift Handover frontend

React 19 + Vite single-page app for ground crew and supervisors. It talks to the Express API
(`../backend`) over REST and Socket.IO; it never calls the inference service directly.

```bash
npm install
cp .env.example .env
npm run dev
```

Open http://localhost:5173. The backend must be running (see `../backend/README.md`).

| Command | |
|---|---|
| `npm run dev` | Development server with hot reload |
| `npm run build` | Production build into `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | ESLint |

## Settings (`.env`)

| Variable | Default | |
|---|---|---|
| `VITE_API_URL` | `http://localhost:3000/api` | Backend API base URL |
| `VITE_GOOGLE_CLIENT_ID` | (empty) | Google OAuth client ID; the "Sign in with Google" button is hidden without it |

Everything in this file is built into the page and visible to users, so it must never hold secrets.
Operational defaults (low-confidence threshold, refresh intervals) are in `src/config.js`; shift
times come from the backend at start-up.

## What's where

| Path | |
|---|---|
| `src/App.jsx` | Routes. `/` is each role's home; role-only routes are wrapped in `RoleRoute` |
| `src/auth/` | Session (`AuthProvider`), protected and guest routes |
| `src/api/client.js` | Every API call, in one place |
| `src/components/shell/` | Header, navigation, alerts drawer, live updates (`AppShell`) |
| `src/components/composer/` | The handover form, completeness hints and voice input |
| `src/components/people/` | Supervisor people management (Team page) |
| `src/pages/` | One file per page; `ground/` and `supervisor/` hold role-only pages |
| `src/hooks/` | Data loading (`useResource`, `useData`), real-time (`useRealtime`) |
| `src/styles/theme.css` | All colours, spacing and type as CSS variables (dark default, light theme) |

| Role | Pages |
|---|---|
| Ground crew | Home (write a handover, briefing), My tasks, Reports, Alerts, Your account |
| Supervisor | Overview, Triage, Reports, Team (workload and people), Your account |

## Design

The interface follows the "Strip board" design described in [`DESIGN.md`](DESIGN.md): rules,
tokens, components, accessibility decisions and why they were made. Read it before changing the UI.

## Notes

- Voice input needs the microphone, which browsers only allow on `localhost` or HTTPS. Safari
  records MP4, other browsers WebM; both are transcribed on the server.
- End-to-end tests for the whole app are in `../e2e`.
