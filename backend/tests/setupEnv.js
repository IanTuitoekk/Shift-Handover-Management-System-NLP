// Runs before every test file (jest "setupFiles"), before config/db.js reads the environment.
// Points the app at a separate test database so tests never write into the development data.
require('dotenv').config();

process.env.DB_NAME = process.env.TEST_DB_NAME || `${process.env.DB_NAME}_test`;

if (!process.env.DB_NAME.endsWith('_test')) {
  throw new Error(`Refusing to run tests against "${process.env.DB_NAME}": test database names must end in _test.`);
}
