# Shift Handover Backend

Express.js API serving the Shift Handover Management System. Handles authentication,
handover submission/retrieval, task tracking, and notifications. Delegates NLP
inference (classification, NER, summarization) to a separate Python FastAPI
microservice (`../inference-service`).

## Setup

Needs Node.js 20+ and PostgreSQL 14+ running locally.

```bash
npm install
cp .env.example .env
npm run db:setup
npm run dev
```

Fill in `.env` before `npm run db:setup` (at least the `DB_*` values and `JWT_SECRET`).
`db:setup` creates the database if it doesn't exist and applies `db/schema.sql`, every file in
`db/migrations/` and `db/seed.sql`. Run it again after pulling new code: on an existing database it
only applies the migrations, which are all safe to repeat.

The API listens on http://localhost:3000. The first supervisor is made from the command line after
signing up in the app: `npm run set-role -- <email> supervisor`.

| Command | |
|---|---|
| `npm run dev` | API with auto-restart (nodemon) |
| `npm start` | API without auto-restart |
| `npm run db:setup` | Create or update the database |
| `npm run set-role -- <email> <ground_crew\|supervisor>` | Change someone's role |
| `npm test` | Tests, on a separate `_test` database rebuilt each run |
| `npm run test-email -- <address>` | Send a sample email to check the SMTP settings |
| `npm run reprocess-entities` | Re-run the model on stored handovers (preview; `--apply` to save) |

## API Endpoints

| Method | Endpoint | Auth required | Description |
|---|---|---|---|
| POST | /api/auth/register | No | Register a new user |
| POST | /api/auth/login | No (rate-limited) | Log in, returns JWT |
| GET | /api/auth/me | Yes | Get current user profile (includes `staff_number`, `station`) |
| POST | /api/auth/change-password | Yes | `{ current_password, new_password }` (min 8). Ends every other session and returns `{ user, token }` for this one |
| POST | /api/auth/google | No (rate-limited) | Sign in with Google: `{ credential }` (the ID token from Google Identity Services). Returns `{ user, token, created }` (201 when a new ground crew account was created), or `{ link_required: true, link_ticket, email }` when the email already has an account |
| POST | /api/auth/google/link | No (rate-limited) | `{ link_ticket, password }`: the existing account's password links Google and signs in. The ticket lasts 5 minutes and can't be used as a session |
| POST | /api/auth/forgot-password | No (rate-limited) | `{ email }`. Emails a one-time reset link to an active account. Always answers the same, whether or not the email exists |
| POST | /api/auth/reset-password | No (rate-limited) | `{ token, new_password }` from the emailed link. Ends every session of that account |
| POST | /api/handovers | Yes | Submit a handover narrative for NLP processing (`input_type`: `text` or `voice`) |
| POST | /api/handovers/transcribe | Yes (20 per 10 min per person) | Voice input: multipart `audio` (≤ 10 MB) and optional `language` (`en`/`sw`). Returns `{ text, language, language_probability, duration }` from the inference service's Whisper. Nothing is saved; the recording is kept in memory only. 503 if the inference service is down |
| GET | /api/handovers | Yes | List handover reports (`limit` ≤ 100, `offset`). Filters: `submitted_by=me` or a user id, `shift=day|night`, `category=<name>|unclassified`, `review=true|false` (below `LOW_CONFIDENCE_THRESHOLD`, default 0.6, or unclassified), `min_confidence`, `max_confidence` (0–1, max exclusive), `from`, `to` (ISO, `to` exclusive), `sort=newest|confidence`. Returns `{ reports, total, needs_review, shift_counts: { day, night }, limit, offset }`; each report includes `submitted_by` and `shift` |
| GET | /api/handovers/:reportId | Yes | Get full detail for one report (entities, task, notification, submitted_by, and `submission`: the original text, shift, detected language and submission time) |
| GET | /api/tasks | Yes | List tasks (optional `status`, `shift=day|night`); each task includes the `shift` of the handover that raised it, `needs_reassignment`, and `assignee` / `resolver` as `{ user_id, full_name, is_active, anonymised }` |
| PATCH | /api/tasks/:taskId/resolve | Yes | Mark a task resolved |
| PATCH | /api/tasks/:taskId/assign | Yes (supervisor only) | `{ "assigned_to": "<user id>" }` assigns (active people only); `{ "assigned_to": null }` unassigns. Resolved tasks can't be reassigned |
| PATCH | /api/tasks/:taskId/due | Yes (supervisor only) | Set (`{ "due_at": "ISO date-time" }`) or clear (`{ "due_at": null }`) a task's due time |
| GET | /api/notifications | Yes | List notifications for current user, with per-user read status |
| PATCH | /api/notifications/:notifId/read | Yes | Mark a notification read (per-user, does not affect other recipients) |
| PATCH | /api/notifications/read | Yes | Mark many read: `{ "notif_ids": [...] }` (up to 500) or `{ "before": "ISO" }`. Only notifications the user can see; returns `{ marked }` |
| GET | /api/stats/overview | Yes | Supervisor overview counts: `current_shift`, `recent_shifts` (`?shifts=6`), `today.reports_per_hour`, `reports { total, needs_review }`, `categories`, `tasks { open, overdue, unassigned }` |
| GET | /api/insights/entities | Yes | Entities in two or more reports: `?types=AIRCRAFT,COMPONENT&since=ISO&min_reports=2&limit=6` → `[{ entity_type, entity_text, report_count }]` |
| GET | /api/config/shifts | No | `{ timezone, day_start_hour, night_start_hour, shifts: [{ key, name, start, end }] }` |
| GET | /api/users | Yes (supervisor) | List active users for task assignment |
| GET | /api/users/workload | Yes (supervisor) | Per active person: `open`, `overdue`, and `resolved_since` / `handovers_since` since `?since=ISO` (default: start of the current shift) |
| GET | /api/users/directory | Yes (supervisor) | Everyone with an account, including deactivated and deleted ("Former employee") ones, with `staff_number`, `station`, `deactivated_at`, `deactivated_by { user_id, full_name }`, `deactivation_reason`, `anonymised_at` |
| PATCH | /api/users/:userId | Yes (supervisor) | Edit a ground crew member's `full_name`, `email`, `staff_number`, `station` (empty clears the last two). 409 if the email or staff number is taken; 403 for supervisor accounts |
| PATCH | /api/users/:userId/role | Yes (supervisor) | Change a role `{ role }` |
| PATCH | /api/users/:userId/active | Yes (supervisor) | `{ active: false, reason? }` deactivates (signs them out at once, flags their open tasks `needs_reassignment`); `{ active: true }` reactivates |
| DELETE | /api/users/:userId | Yes (supervisor) | Permanent delete of a **deactivated ground crew** account (see below) |

Supervisors cannot deactivate, delete or change the role of their own account, and there must always be at
least one active supervisor. Supervisor accounts can be deactivated but never deleted. Assigning a task to a
deactivated person is refused.

### Deactivate vs delete permanently

- **Deactivate** (reversible): `is_active = false` plus `deactivated_at`, `deactivated_by` and an optional
  reason. The row is kept. Login and existing tokens stop working at once. Open tasks assigned to them get
  `needs_reassignment = true` until a supervisor reassigns them or the person is reactivated.
- **Delete permanently** (irreversible, one transaction). Their read receipts, notifications addressed only
  to them and reset links are removed in both cases, then:
  - **a. No records** (never submitted a handover, never assigned or resolved a task): the `users` row is deleted.
  - **b. Has records**: the row stays so history stays linked by `user_id`, but the identity is erased: name
    becomes "Former employee", email `deleted-<user_id>@removed.invalid`, the password hash is replaced with an
    unusable one, staff number, station and reason are cleared, `anonymised_at` is set. Their open tasks are
    unassigned and flagged. An anonymised account can't be reactivated, and the original email can sign up again.

  Each deletion writes one line to the server log with ids only, for example
  `[users] permanent delete by=<supervisor id> user=<user id> case=b (has records, anonymised) at=<ISO time>`.

### Forgotten passwords

`POST /api/auth/forgot-password` stores only a SHA-256 hash of a random token (valid 30 minutes,
`PASSWORD_RESET_MINUTES`) and emails `<FRONTEND_URL>/reset-password?token=…`. A new request replaces older
links, and a link works once. Setting a new password sets `password_changed_at`, so every token issued before
it is rejected.

### Email

Without `SMTP_HOST` (development) reset emails, link included, are printed in the backend console.
To really send them, add an SMTP account to `backend/.env` and restart the backend. On start-up the
console says either `[mail] Sending email through …` or why it can't (wrong password, blocked port).
Send yourself a sample with `npm run test-email -- you@example.com`.

| Variable | Default | Meaning |
|---|---|---|
| `SMTP_HOST` | (unset) | SMTP server; unset prints emails instead |
| `SMTP_PORT` | `587` | `465` (TLS) or `587` (STARTTLS) |
| `SMTP_SECURE` | `true` on port 465 | |
| `SMTP_USER`, `SMTP_PASSWORD` | | Login. For Gmail an **app password**, never the account password |
| `MAIL_FROM` | `Shift Handover <SMTP_USER>` | Sender. Providers usually only accept a From address they have verified |
| `FRONTEND_URL` | first `FRONTEND_ORIGIN`, else `http://localhost:5173` | Where the link in the email points (set to the real site when deployed) |

**Gmail (good for development and small pilots, about 500 emails a day):** turn on 2-Step
Verification for the Google account, create an app password at
https://myaccount.google.com/apppasswords, then:

```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER=you@gmail.com
SMTP_PASSWORD=the16letterapppassword
MAIL_FROM=Shift Handover <you@gmail.com>
```

**For production** use a transactional email service (for example Brevo, Resend, Mailgun or Amazon
SES) with the airline's own domain verified (SPF and DKIM), so emails come from an address like
`no-reply@…` and don't land in spam. Only the `SMTP_*` and `MAIL_FROM` values change.

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
| `user:role-changed` | (to that user) a supervisor changed their role | `{ role }` |
| `users:changed` | (to supervisors) an account was edited, deactivated, reactivated or deleted | `{ user_id }` |
| `tasks:reassignment-needed` | an assignee was deactivated or deleted | `{ task_ids, by }` |
| `session:ended` | (to that user) password reset by email, account deactivated or deleted; the socket is then closed | `{ reason }` |

Set `FRONTEND_ORIGIN` (comma-separated) to allow other frontend origins; the default is
`http://localhost:5173`.

## Shifts

A report's `shift` is the one chosen on the handover form, or, if none was chosen, the shift its
submission time falls in. Configure with `DAY_SHIFT_START` (default 6), `NIGHT_SHIFT_START` (18) and
`SHIFT_TIMEZONE` (`Africa/Nairobi`). The frontend reads the same values from `GET /api/config/shifts`,
and the overview statistics count shifts in `SHIFT_TIMEZONE`.

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

## Sign in with Google

Set `GOOGLE_CLIENT_ID` (a Google Cloud OAuth client ID of type "Web application", with
`http://localhost:5173` as an authorised JavaScript origin; no client secret is used). The frontend
needs the same value as `VITE_GOOGLE_CLIENT_ID`. Without it the endpoints answer 503 and the button
is hidden.

- Any Google account with a **verified** email can sign in. The ID token is verified with
  `google-auth-library` (signature, issuer, audience = our client id, expiry).
- A Google account seen before (`users.google_sub`) signs straight in. A new email gets a
  **ground crew** account with the Google name and no password (password login then says to use
  Google; "Forgot password?" can set one).
- An email that already has an account must confirm that account's **password once**; Google is then
  linked. A different Google account can't take over a linked email (409).
- Deactivated accounts are refused (403). Anonymising an account clears its Google link.
- Whether Google sign-ins will also need our MFA is decided when MFA is built.
- While the Google Cloud consent screen is in "Testing", only its listed test users can sign in;
  publish it to allow any Google account.

## Repairing stored entities

After a model or decoder change, `npm run reprocess-entities` re-runs the inference service on
every stored handover and **previews** which reports' entities would change. Add `--apply` to save
(entities only; category, summary, tasks and alerts are untouched) and `--report <id>` to limit it
to one report.

## Testing

```bash
npm test
```

Tests run against a separate database, `<DB_NAME>_test` (or `TEST_DB_NAME`), never your development
data. `npm test` first rebuilds it from `db/schema.sql`, `db/migrations/` and `db/seed.sql`
(`scripts/reset-test-db.js`), and `tests/setupEnv.js` refuses any database whose name doesn't end in
`_test`. The database user needs permission to create databases.

The handover tests call the real inference service, so start `../inference-service` on port 8000 first.
