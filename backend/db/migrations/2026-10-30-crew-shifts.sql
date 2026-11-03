-- The shift each crew member works, so a new handover's task goes to the incoming shift.
-- Additive and safe to run more than once. NULL = not rostered (never auto-assigned).
ALTER TABLE users ADD COLUMN IF NOT EXISTS shift VARCHAR(10) CHECK (shift IN ('day', 'night'));
