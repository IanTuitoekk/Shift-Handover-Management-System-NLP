#!/usr/bin/env node
// Recreates the test database from db/schema.sql, db/migrations/*.sql and db/seed.sql.
// Runs automatically before `npm test` (the "pretest" script), so every run starts clean.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const testDb = process.env.TEST_DB_NAME || `${process.env.DB_NAME}_test`;
if (!testDb.endsWith('_test')) {
  console.error(`Refusing to reset "${testDb}": test database names must end in _test.`);
  process.exit(1);
}

const connection = {
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
};
const sql = (file) => fs.readFileSync(path.join(__dirname, '..', 'db', file), 'utf8');

(async () => {
  // Connect to the maintenance database to drop and recreate the test database.
  const admin = new Client({ ...connection, database: 'postgres' });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS "${testDb}" WITH (FORCE)`);
  await admin.query(`CREATE DATABASE "${testDb}"`);
  await admin.end();

  const db = new Client({ ...connection, database: testDb });
  await db.connect();
  await db.query(sql('schema.sql'));
  const migrations = fs.readdirSync(path.join(__dirname, '..', 'db', 'migrations')).filter((f) => f.endsWith('.sql')).sort();
  for (const m of migrations) await db.query(sql(path.join('migrations', m)));
  await db.query(sql('seed.sql'));
  await db.end();
  console.log(`Test database "${testDb}" is ready (schema, ${migrations.length} migration(s), seed).`);
})().catch((err) => {
  console.error('Could not reset the test database:', err.message);
  process.exit(1);
});
