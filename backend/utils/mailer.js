/*
 * Outgoing email. With SMTP_HOST set, mail is sent through that server (SMTP_PORT, SMTP_USER,
 * SMTP_PASSWORD, SMTP_SECURE, MAIL_FROM). Without it (development), the message is printed to the
 * server console instead, so reset links can be followed locally.
 */
const nodemailer = require('nodemailer');

let transport = null;
function getTransport() {
  if (!process.env.SMTP_HOST) return null;
  transport ??= nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined,
  });
  return transport;
}

async function sendMail({ to, subject, text }) {
  const smtp = getTransport();
  if (!smtp) {
    console.info(`[mail] (no SMTP_HOST; not sent)\nTo: ${to}\nSubject: ${subject}\n\n${text}\n`);
    return;
  }
  await smtp.sendMail({ from: process.env.MAIL_FROM || 'Shift Handover <no-reply@localhost>', to, subject, text });
}

async function sendPasswordReset({ to, name, link, minutes }) {
  await sendMail({
    to,
    subject: 'Reset your Shift Handover password',
    text: [
      `Hello ${name},`,
      '',
      'Someone asked to reset the password for your Shift Handover account.',
      `Open this link within ${minutes} minutes to choose a new password:`,
      '',
      link,
      '',
      "If this wasn't you, ignore this email. Your password stays the same.",
    ].join('\n'),
  });
}

module.exports = { sendMail, sendPasswordReset };
