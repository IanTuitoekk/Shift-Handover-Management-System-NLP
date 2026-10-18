# End-to-end tests

Playwright tests that drive the real app in a browser: the React frontend and Express backend
run as they do in development, against their own database, with a small fake inference service.

```bash
cd e2e
npm install
npm run install-browser
npm test
```

`npm run install-browser` is needed once per machine (it downloads Playwright's Chromium).
`npm test` starts everything, runs the suite (about 40 s) and stops everything again.

`npm run test:headed` shows the browser; `npm run report` opens the last HTML report (with
screenshots of failures; traces are recorded when a failed test is retried, as on CI).

## What it needs

- PostgreSQL running, with the credentials in `backend/.env` (the same as development).
- `npm install` done in `backend/` and `frontend/`.
- Ports **8100, 3100 and 5174** free. The dev app (8000, 3000, 5173) can keep running.

## How it is set up

| Piece | Port | Notes |
|---|---|---|
| Fake inference (`support/fake-inference.js`) | 8100 | Fixed answers instead of mBERT and Whisper, so runs are fast and repeatable. `unclear` in a narrative gives a low-confidence report; any recording becomes a fixed transcript. The real models are tested in `inference-service/tests`. |
| Backend | 3100 | Database `<DB_NAME>_e2e_test`, **rebuilt empty on every run** from `schema.sql`, migrations and `seed.sql` (it never touches the dev database or the `_test` database the unit tests use). |
| Frontend | 5174 | Points at the backend on 3100. |

`tests/setup.js` creates three accounts through the API (a supervisor and two ground crew, see
`support/env.js`) and saves a signed-in session for each, so tests don't hit the login rate limit.
Google's sign-in script is replaced with a stand-in on every page (`support/fixtures.js`); the
backend's own tests cover Google token checks. Chromium gets a fake microphone for voice input.

## What is covered

| File | Flows |
|---|---|
| `auth.spec.js` | wrong password, log in and out, forgot password, Google sign-in with password linking |
| `handover.spec.js` | typed handover → analysis result → task for the next crew; draft survives reload; spoken handover → transcript to check → saved as `voice` |
| `supervisor.spec.js` | new handover reaches the supervisor live, assigning reaches the crew live, crew resolve it; unassigning; server-side report filters and the review count |
| `people.spec.js` | edit crew details; deactivate signs the person out live, reactivate; permanent delete confirmed by typing the email |
| `mobile.spec.js` | crew and supervisor pages don't scroll sideways on a phone; mic and account reachable |

Tests run one at a time (they share one backend and database). When a test changes the UI, prefer
role- and label-based locators (`getByRole`, `getByLabel`) so the tests describe what a person
sees, and scope text matches to `main` (the alerts drawer repeats report text).
