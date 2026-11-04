-- Shifts are named daily windows that supervisors manage (any number, e.g. 22:00-06:00 crosses
-- midnight), replacing the fixed Day/Night split. Also: shift plans (who works a shift on a date and
-- who they take over from), each handover's shift copied at submission, and the crew roster.
-- Additive and safe to run more than once; nothing is deleted.

CREATE TABLE IF NOT EXISTS shifts (
    shift_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(50) NOT NULL CHECK (length(btrim(name)) > 0),
    start_time  TIME NOT NULL,  -- wall-clock time in SHIFT_TIMEZONE
    end_time    TIME NOT NULL CHECK (end_time <> start_time),  -- before start_time = crosses midnight
    is_active   BOOLEAN NOT NULL DEFAULT true,  -- deactivated, never deleted: old handovers point at it
    updated_by  UUID REFERENCES users(user_id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Active shifts have unique names (case-insensitive); overlaps are checked by the API.
CREATE UNIQUE INDEX IF NOT EXISTS shifts_active_name ON shifts (lower(btrim(name))) WHERE is_active;

-- The shift a handover was written for, and its name then, so later edits don't rewrite old reports.
ALTER TABLE handover_submissions ADD COLUMN IF NOT EXISTS shift_id UUID REFERENCES shifts(shift_id);
ALTER TABLE handover_submissions ADD COLUMN IF NOT EXISTS shift_name VARCHAR(50);
-- The shift a crew member is rostered on (replaces users.shift, which is kept but no longer used).
ALTER TABLE users ADD COLUMN IF NOT EXISTS shift_id UUID REFERENCES shifts(shift_id) ON DELETE SET NULL;
-- How a task was assigned automatically: 'takes_over', 'shift_plan' or 'roster'. NULL once a supervisor assigns it.
ALTER TABLE task_register ADD COLUMN IF NOT EXISTS assigned_by_rule VARCHAR(20);

CREATE TABLE IF NOT EXISTS shift_plans (
    plan_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shift_date  DATE NOT NULL,  -- the calendar day (SHIFT_TIMEZONE) the shift starts on
    shift_id    UUID REFERENCES shifts(shift_id),
    updated_by  UUID REFERENCES users(user_id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Databases that ran an earlier draft keyed plans by 'day' / 'night'.
ALTER TABLE shift_plans ADD COLUMN IF NOT EXISTS shift_id UUID REFERENCES shifts(shift_id);
CREATE UNIQUE INDEX IF NOT EXISTS shift_plans_date_shift ON shift_plans (shift_date, shift_id);

CREATE TABLE IF NOT EXISTS shift_plan_members (
    plan_id          UUID NOT NULL REFERENCES shift_plans(plan_id) ON DELETE CASCADE,
    user_id          UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    takes_over_from  UUID REFERENCES users(user_id) ON DELETE SET NULL,  -- NULL = nobody in particular
    PRIMARY KEY (plan_id, user_id)
);

DO $$
BEGIN
  -- First run only (supervisors can't delete shifts, so the table never empties again): seed the
  -- old fixed shifts and move existing handovers, rosters and plans onto them.
  IF NOT EXISTS (SELECT 1 FROM shifts) THEN
    INSERT INTO shifts (name, start_time, end_time) VALUES ('Day', '06:00', '18:00'), ('Night', '18:00', '06:00');

    UPDATE handover_submissions s
       SET shift_id = sh.shift_id, shift_name = sh.name
      FROM shifts sh
     WHERE s.shift_id IS NULL
       AND sh.name = CASE
             WHEN lower(s.shift) IN ('day', 'night') THEN initcap(lower(s.shift))
             WHEN EXTRACT(HOUR FROM s.submitted_at AT TIME ZONE 'Africa/Nairobi') BETWEEN 6 AND 17 THEN 'Day'
             ELSE 'Night'
           END;

    UPDATE users u SET shift_id = sh.shift_id
      FROM shifts sh
     WHERE u.shift_id IS NULL AND u.shift IS NOT NULL AND sh.name = initcap(u.shift);
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'shift_plans' AND column_name = 'shift_key') THEN
    UPDATE shift_plans p SET shift_id = sh.shift_id
      FROM shifts sh
     WHERE p.shift_id IS NULL AND sh.is_active AND lower(sh.name) = p.shift_key;
    ALTER TABLE shift_plans ALTER COLUMN shift_key DROP NOT NULL;
  END IF;
END $$;
