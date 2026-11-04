const pool = require('../config/db');

// A person on a plan; deactivated and deleted people stay visible so supervisors can replace them.
const MEMBER_FIELDS = `m.user_id, u.full_name, u.is_active, u.anonymised_at IS NOT NULL AS anonymised,
  m.takes_over_from, f.full_name AS takes_over_from_name`;

/**
 * Plans for the given shift runs ([{ date: 'YYYY-MM-DD', shift_id }]), as a Map of `${date}:${shift_id}` to
 * { plan_id, updated_at, updated_by_name, members: [{ user_id, full_name, is_active, anonymised,
 * takes_over_from, takes_over_from_name }] }. Shifts without a plan are missing from the map.
 */
async function getPlans(shifts) {
  if (!shifts.length) return new Map();
  const result = await pool.query(
    `SELECT p.plan_id, to_char(p.shift_date, 'YYYY-MM-DD') AS shift_date, p.shift_id, p.updated_at,
            ub.full_name AS updated_by_name,
            COALESCE(json_agg(json_build_object(
              'user_id', m.user_id, 'full_name', u.full_name, 'is_active', u.is_active,
              'anonymised', u.anonymised_at IS NOT NULL,
              'takes_over_from', m.takes_over_from, 'takes_over_from_name', f.full_name
            ) ORDER BY u.full_name) FILTER (WHERE m.user_id IS NOT NULL), '[]') AS members
     FROM shift_plans p
     LEFT JOIN users ub ON ub.user_id = p.updated_by
     LEFT JOIN shift_plan_members m ON m.plan_id = p.plan_id
     LEFT JOIN users u ON u.user_id = m.user_id
     LEFT JOIN users f ON f.user_id = m.takes_over_from
     WHERE (to_char(p.shift_date, 'YYYY-MM-DD'), p.shift_id) IN (SELECT * FROM unnest($1::text[], $2::uuid[]))
     GROUP BY p.plan_id, ub.full_name`,
    [shifts.map((s) => s.date), shifts.map((s) => s.shift_id)]
  );
  return new Map(result.rows.map(({ shift_date, shift_id, ...plan }) => [`${shift_date}:${shift_id}`, plan]));
}

/**
 * Replaces the plan for a shift with `members` ([{ user_id, takes_over_from }]). No members deletes
 * the plan, so the shift goes back to the Day/Night roster. Returns true if a plan now exists.
 */
async function savePlan({ date, shiftId, members, by }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (!members.length) {
      await client.query(`DELETE FROM shift_plans WHERE shift_date = $1 AND shift_id = $2`, [date, shiftId]);
    } else {
      const { rows } = await client.query(
        `INSERT INTO shift_plans (shift_date, shift_id, updated_by) VALUES ($1, $2, $3)
         ON CONFLICT (shift_date, shift_id) DO UPDATE SET updated_by = $3, updated_at = now()
         RETURNING plan_id`,
        [date, shiftId, by]
      );
      const planId = rows[0].plan_id;
      await client.query(`DELETE FROM shift_plan_members WHERE plan_id = $1`, [planId]);
      await client.query(
        `INSERT INTO shift_plan_members (plan_id, user_id, takes_over_from)
         SELECT $1, * FROM unnest($2::uuid[], $3::uuid[])`,
        [planId, members.map((m) => m.user_id), members.map((m) => m.takes_over_from ?? null)]
      );
    }
    await client.query('COMMIT');
    return members.length > 0;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Who on a planned shift gets a task from `writerId`: whoever takes over from the writer, else the
 * least busy active ground crew member on the plan (never the writer; ties as in pickAssignee).
 * Returns { planned: false } with no plan, else { planned: true, userId (or null), takesOver }.
 */
async function pickPlannedAssignee({ date, shiftId, writerId }) {
  const plan = await pool.query(`SELECT plan_id FROM shift_plans WHERE shift_date = $1 AND shift_id = $2`, [date, shiftId]);
  if (!plan.rows.length) return { planned: false };
  const result = await pool.query(
    `SELECT m.user_id, COALESCE(m.takes_over_from = $2, false) AS takes_over
     FROM shift_plan_members m
     JOIN users u ON u.user_id = m.user_id
     LEFT JOIN task_register t ON t.assigned_to = u.user_id
     WHERE m.plan_id = $1 AND u.role = 'ground_crew' AND u.is_active AND u.anonymised_at IS NULL AND u.user_id <> $2
     GROUP BY m.user_id, m.takes_over_from
     ORDER BY takes_over DESC, COUNT(t.task_id) FILTER (WHERE t.status = 'pending'), MAX(t.created_at) NULLS FIRST, m.user_id
     LIMIT 1`,
    [plan.rows[0].plan_id, writerId]
  );
  const row = result.rows[0];
  return { planned: true, userId: row?.user_id ?? null, takesOver: Boolean(row?.takes_over) };
}

/** Every planned shift run starting on or after `fromDate` ('YYYY-MM-DD'): [{ date, shift_id }]. */
async function listPlannedShifts(fromDate) {
  const result = await pool.query(
    `SELECT to_char(shift_date, 'YYYY-MM-DD') AS date, shift_id FROM shift_plans
     WHERE shift_date >= $1 AND shift_id IS NOT NULL ORDER BY shift_date`,
    [fromDate]
  );
  return result.rows;
}

/** Active ground crew, for planning: { user_id, full_name, shift_id } (shift_id: the shift they are rostered on). */
async function listPlannableCrew() {
  const result = await pool.query(
    `SELECT user_id, full_name, shift_id FROM users
     WHERE role = 'ground_crew' AND is_active AND anonymised_at IS NULL
     ORDER BY full_name`
  );
  return result.rows;
}

module.exports = { getPlans, savePlan, pickPlannedAssignee, listPlannedShifts, listPlannableCrew };
