// Direct access to the e2e database, for setup and for checking what the app saved.
const path = require('path');
const dotenv = require('dotenv');
const { Client } = require('pg');
const env = require('./env');

// backend/.env locally; plain environment variables on CI.
const fromFile = dotenv.config({ path: path.join(env.ROOT, 'backend', '.env'), processEnv: {}, quiet: true }).parsed ?? {};
const conf = Object.fromEntries(
  ['DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASSWORD'].map((k) => [k, fromFile[k] ?? process.env[k]]),
);

async function query(sql, params = []) {
  const client = new Client({
    host: conf.DB_HOST,
    port: conf.DB_PORT,
    user: conf.DB_USER,
    password: conf.DB_PASSWORD,
    database: env.E2E_DB,
  });
  await client.connect();
  try {
    return (await client.query(sql, params)).rows;
  } finally {
    await client.end();
  }
}

module.exports = { query };
