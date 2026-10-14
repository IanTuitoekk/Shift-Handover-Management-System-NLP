# Shift Handover Backend

Express.js API serving the Shift Handover Management System. Handles authentication,
handover submission/retrieval, task tracking, and notifications. Delegates NLP
inference (classification, NER, summarization) to a separate Python FastAPI
microservice (`../inference-service`).

## Setup

```bash
npm install
cp .env.example .env   # fill in your local DB credentials and secrets
npm run dev
```

## API Endpoints

| Method | Endpoint | Auth required | Description |
|---|---|---|---|
| POST | /api/auth/register | No | Register a new user |
| POST | /api/auth/login | No (rate-limited) | Log in, returns JWT |
| GET | /api/auth/me | Yes | Get current user profile |
| POST | /api/handovers | Yes | Submit a handover narrative for NLP processing |
| GET | /api/handovers | Yes | List handover reports, newest first (`limit`, `offset`, optional `submitted_by=me` or a user id, `shift=day|night`); each report includes `submitted_by: { user_id, full_name, role }` and `shift` |
| GET | /api/handovers/:reportId | Yes | Get full detail for one report (entities, task, notification, submitted_by, and `submission`: the original text, shift, detected language and submission time) |
| GET | /api/tasks | Yes | List tasks (optional `status`, `shift=day|night`); each task includes the `shift` of the handover that raised it |
| PATCH | /api/tasks/:taskId/resolve | Yes | Mark a task resolved |
| PATCH | /api/tasks/:taskId/assign | Yes (supervisor only) | Assign a task to a user |
| PATCH | /api/tasks/:taskId/due | Yes (supervisor only) | Set (`{ "due_at": "ISO date-time" }`) or clear (`{ "due_at": null }`) a task's due time |
| GET | /api/notifications | Yes | List notifications for current user, with per-user read status |
| PATCH | /api/notifications/:notifId/read | Yes | Mark a notification read (per-user, does not affect other recipients) |
| GET | /api/users | Yes (supervisor) | List active users for task assignment |



## Real-time updates (Socket.IO)

The server also accepts Socket.IO connections on the same port. Connect with the JWT:
`io('http://localhost:3000', { auth: { token } })`. The handshake applies the same checks as the
REST API and the socket is closed when the token expires.

| Event | When | Payload |
|---|---|---|
| `handover:created` | a handover has been processed | `{ report, task, notification, submittedBy }` |
| `task:assigned` | a supervisor assigns or reassigns a task | `{ task, by, previousAssignee }` |
| `task:resolved` | a task is resolved | `{ task, by }` |
| `task:updated` | a supervisor changes a task's due time | `{ task, by }` |

Set `FRONTEND_ORIGIN` (comma-separated) to allow other frontend origins; the default is
`http://localhost:5173`.

## Shifts

A report's `shift` is the one chosen on the handover form, or, if none was chosen, the shift its
submission time falls in. Configure with `DAY_SHIFT_START` (default 6), `NIGHT_SHIFT_START` (18) and
`SHIFT_TIMEZONE` (`Africa/Nairobi`).

## Due times

Tasks have a `due_at`. New tasks are due `DEFAULT_TASK_DUE_HOURS` (default 12) after they are
raised; supervisors can change or clear it. A pending task past its `due_at` is overdue; a task with
no due time is never shown as overdue. Existing databases need the migration once:
`psql -d <db> -f db/migrations/2026-10-12-task-due-at.sql`.

## Language detection

Clients no longer send `language_variant`. When it is missing, the backend detects `en`, `sw` or
`mixed` from the narrative (`utils/languageDetect.js`) and stores it for analysis; it does not
affect classification. `npx jest tests/languageDetect.test.js` runs its tests without the database.



- Passwords hashed with bcrypt
- JWT-based authentication, 24h expiry
- Role-based access control on sensitive actions (e.g. task assignment)
- Rate limiting on login (10 attempts / 15 min)
- Helmet security headers
- Input validation via express-validator

## Testing

```bash
npm test
```

Tests run against a separate database, `<DB_NAME>_test` (or `TEST_DB_NAME`), never your development
data. `npm test` first rebuilds it from `db/schema.sql`, `db/migrations/` and `db/seed.sql`
(`scripts/reset-test-db.js`), and `tests/setupEnv.js` refuses any database whose name doesn't end in
`_test`. The database user needs permission to create databases.

The handover tests call the real inference service, so start `../inference-service` on port 8000 first.
