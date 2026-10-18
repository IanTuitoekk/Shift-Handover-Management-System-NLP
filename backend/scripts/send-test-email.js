#!/usr/bin/env node
// Sends one sample password-reset email, to check the SMTP settings in backend/.env.
//   npm run test-email -- you@example.com
require('dotenv').config();
const { verifyMailer, sendPasswordReset } = require('../utils/mailer');

const to = process.argv[2];
if (!to || !/^\S+@\S+\.\S+$/.test(to)) {
  console.error('Usage: npm run test-email -- you@example.com');
  process.exit(1);
}

(async () => {
  if (!process.env.SMTP_HOST) {
    console.error('SMTP_HOST is not set in backend/.env, so nothing would be sent. See the README section "Email".');
    process.exit(1);
  }
  if (!(await verifyMailer())) process.exit(1);
  const base = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');
  await sendPasswordReset({ to, name: 'Test', link: `${base}/reset-password?token=this-is-only-a-test`, minutes: 30 });
  console.log(`Sent a test email to ${to}. Check the inbox (and the spam folder). The link in it is not a real reset link.`);
})().catch((err) => {
  console.error('Sending failed:', err.message);
  process.exit(1);
});
