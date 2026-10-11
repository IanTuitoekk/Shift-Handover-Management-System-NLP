-- Real due times on tasks. Additive and safe to run more than once.
-- Existing tasks get no due time (NULL = "no due time set"); a supervisor can set one.
-- New tasks get a default due time from the backend (DEFAULT_TASK_DUE_HOURS, default 12).
ALTER TABLE task_register ADD COLUMN IF NOT EXISTS due_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_tasks_due ON task_register(due_at);
