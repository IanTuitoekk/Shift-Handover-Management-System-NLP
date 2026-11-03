-- Ground crew mark their task done; a supervisor then signs it off (resolves it) or sends it back.
-- Additive and safe to run more than once. NULL = not marked done.
ALTER TABLE task_register ADD COLUMN IF NOT EXISTS done_at TIMESTAMPTZ;
ALTER TABLE task_register ADD COLUMN IF NOT EXISTS done_by UUID REFERENCES users(user_id) ON DELETE SET NULL;
