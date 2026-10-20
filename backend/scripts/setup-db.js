#!/usr/bin/env node
// Sets up the development database named in backend/.env (DB_NAME), safely:
//   - database missing: creates it, then applies db/schema.sql, every db/migrations/*.sql and
//     db/seed.sql (the incident categories)
//   - database already set up: applies the migrations only (each can safely run more than once),
//     so pulling new code and running this again brings it up to date
// Usage: npm run db:setup
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const name = process.env.DB_NAME;
const connection = {
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
};
const sql = (file) => fs.readFileSync(path.join(__dirname, '..', 'db', file), 'utf8');
const migrations = fs
  .readdirSync(path.join(__dirname, '..', 'db', 'migrations'))
  .filter((f) => f.endsWith('.sql'))
  .sort();

(async () => {
  if (!name) throw new Error('DB_NAME is not set in backend/.env');

  const admin = new Client({ ...connection, database: 'postgres' });
  await admin.connect();
  const exists = (await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [name])).rowCount > 0;
  if (!exists) {
    await admin.query(`CREATE DATABASE "${name.replace(/"/g, '')}"`);
    console.log(`Created database "${name}".`);
  }
  await admin.end();

  const db = new Client({ ...connection, database: name });
  await db.connect();
  const hasSchema = (await db.query(`SELECT to_regclass('public.users') IS NOT NULL AS ok`)).rows[0].ok;
  if (!hasSchema) {
    await db.query(sql('schema.sql'));
    console.log('Applied schema.sql.');
  }
  for (const m of migrations) {
    await db.query(sql(path.join('migrations', m)));
    console.log(`Applied migration ${m}.`);
  }
  if (!hasSchema) {
    await db.query(sql('seed.sql'));
    console.log('Applied seed.sql (incident categories).');
  }
  await db.end();
  console.log(`Database "${name}" is ready.${hasSchema ? '' : ' Next: sign up in the app, then `npm run set-role -- <email> supervisor`.'}`);
})().catch((err) => {
  console.error('Database setup failed:', err.message);
  process.exit(1);
});
