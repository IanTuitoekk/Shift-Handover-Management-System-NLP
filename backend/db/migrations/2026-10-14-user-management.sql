-- Supervisor user management and self-service password reset. Safe to run more than once.

-- Any password change or reset sets this; tokens issued before it are rejected.
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ;

-- Personal details a supervisor can edit for ground crew.
ALTER TABLE users ADD COLUMN IF NOT EXISTS staff_number VARCHAR(50);
ALTER TABLE users ADD COLUMN IF NOT EXISTS station VARCHAR(100);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_staff_number ON users(staff_number) WHERE staff_number IS NOT NULL;

-- Deactivation (reversible) and anonymisation (permanent delete of someone with records).
ALTER TABLE users ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS deactivated_by UUID REFERENCES users(user_id) ON DELETE SET NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS deactivation_reason TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS anonymised_at TIMESTAMPTZ;

-- Superseded by self-service reset (a draft of this migration added it).
ALTER TABLE users DROP COLUMN IF EXISTS must_change_password;

-- Open tasks whose assignee was deactivated or deleted.
ALTER TABLE task_register ADD COLUMN IF NOT EXISTS needs_reassignment BOOLEAN NOT NULL DEFAULT false;

-- "Forgot password" links. Only a SHA-256 hash of the token is stored.
CREATE TABLE IF NOT EXISTS password_reset_tokens (
    token_hash  TEXT PRIMARY KEY,
    user_id     UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    expires_at  TIMESTAMPTZ NOT NULL,
    used_at     TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user ON password_reset_tokens(user_id);
