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
| GET | /api/handovers | Yes | List all handover reports |
| GET | /api/handovers/:reportId | Yes | Get full detail for one report (entities, task, notification) |
| GET | /api/tasks | Yes | List tasks |
| PATCH | /api/tasks/:taskId/resolve | Yes | Mark a task resolved |
| PATCH | /api/tasks/:taskId/assign | Yes (supervisor only) | Assign a task to a user |
| GET | /api/notifications | Yes | List notifications for current user, with per-user read status |
| PATCH | /api/notifications/:notifId/read | Yes | Mark a notification read (per-user, does not affect other recipients) |



## Security

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

Note: the Python inference service (`../inference-service`) must be running on
port 8000 for the handover integration tests to pass.
EOF