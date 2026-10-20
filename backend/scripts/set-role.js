#!/usr/bin/env node
// Sets a user's role from the command line, e.g. to create the first supervisor:
//   npm run set-role -- supervisor@kenya-airways.com supervisor
require('dotenv').config();
const pool = require('../config/db');
const { ROLES } = require('../config/roles');

(async () => {
  const [email, role] = process.argv.slice(2);
  if (!email || !ROLES.includes(role)) {
    console.error(`Usage: npm run set-role -- <email> <${ROLES.join('|')}>`);
    process.exit(1);
  }
  const result = await pool.query(
    'UPDATE users SET role = $1 WHERE email = $2 RETURNING full_name, email, role',
    [role, email]
  );
  if (!result.rowCount) {
    console.error(`No user with email ${email}`);
    process.exitCode = 1;
  } else {
    const u = result.rows[0];
    console.log(`${u.full_name} <${u.email}> is now ${u.role}`);
  }
  await pool.end();
})();
