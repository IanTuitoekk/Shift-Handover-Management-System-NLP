/*
 * Outgoing email (password reset links).
 *
 * With SMTP_HOST set, mail is sent through that SMTP server:
 *   SMTP_HOST       e.g. smtp.gmail.com, smtp-relay.brevo.com, smtp.resend.com
 *   SMTP_PORT       465 (TLS from the start) or 587 (STARTTLS). Default 587.
 *   SMTP_SECURE     "true" for port 465. Defaults to true when SMTP_PORT is 465.
 *   SMTP_USER       login (for Gmail: the full Gmail address)
 *   SMTP_PASSWORD   password or API key (for Gmail: an app password, not the account password)
 *   MAIL_FROM       sender shown to people, e.g. "Shift Handover <you@gmail.com>". Many providers
 *                   only accept a From address they have verified.
 * Without SMTP_HOST (development) the email is printed in the server console instead.
 */
const nodemailer = require('nodemailer');

const PRODUCT = 'Shift Handover';
let transport = null;

function settings() {
  const port = Number(process.env.SMTP_PORT) || 587;
  const secure = process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : port === 465;
  return { host: process.env.SMTP_HOST, port, secure };
}

function getTransport() {
  if (!process.env.SMTP_HOST) return null;
  transport ??= nodemailer.createTransport({
    ...settings(),
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
  });
  return transport;
}

const sender = () => process.env.MAIL_FROM || (process.env.SMTP_USER ? `${PRODUCT} <${process.env.SMTP_USER}>` : `${PRODUCT} <no-reply@localhost>`);

/**
 * Checks the SMTP settings once at start-up and says so in the console, so a wrong password shows
 * up straight away instead of when someone needs a reset. Never throws.
 */
async function verifyMailer() {
  const smtp = getTransport();
  if (!smtp) {
    console.info('[mail] No SMTP_HOST: emails are printed here instead of being sent (development).');
    return false;
  }
  const { host, port, secure } = settings();
  try {
    await smtp.verify();
    console.info(`[mail] Sending email through ${host}:${port}${secure ? ' (TLS)' : ''} as ${sender()}.`);
    return true;
  } catch (err) {
    console.error(`[mail] Can't send email through ${host}:${port}: ${err.message}. Check SMTP_* in backend/.env.`);
    return false;
  }
}

async function sendMail({ to, subject, text, html }) {
  const smtp = getTransport();
  if (!smtp) {
    console.info(`[mail] (no SMTP_HOST; not sent)\nTo: ${to}\nSubject: ${subject}\n\n${text}\n`);
    return { printed: true };
  }
  const info = await smtp.sendMail({ from: sender(), to, subject, text, html });
  console.info(`[mail] Sent "${subject}" to ${to} (${info.messageId})`);
  return info;
}

const escape = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** The reset email as { subject, text, html }. Plain HTML with inline styles, readable in any mail app. */
function passwordResetEmail({ name, link, minutes }) {
  const subject = `Reset your ${PRODUCT} password`;
  const text = [
    `Hello ${name},`,
    '',
    `Someone asked to reset the password for your ${PRODUCT} account.`,
    `Open this link within ${minutes} minutes to choose a new password:`,
    '',
    link,
    '',
    "If this wasn't you, ignore this email. Your password stays the same.",
    '',
    `Kenya Airways ${PRODUCT}`,
  ].join('\n');

  const html = `<!doctype html>
<html lang="en">
<body style="margin:0;padding:0;background:#f3f5f8;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1b2430;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f5f8;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid #dde3ea;border-radius:10px;">
        <tr><td style="padding:24px 28px 8px;font-size:15px;font-weight:600;">Kenya Airways <span style="font-weight:400;color:#5d6b7c;">${PRODUCT}</span></td></tr>
        <tr><td style="padding:8px 28px 0;">
          <h1 style="margin:0 0 12px;font-size:20px;line-height:1.3;">Reset your password</h1>
          <p style="margin:0 0 12px;font-size:15px;line-height:1.5;">Hello ${escape(name)},</p>
          <p style="margin:0 0 20px;font-size:15px;line-height:1.5;">Someone asked to reset the password for your ${PRODUCT} account. This link works once and expires in ${minutes} minutes.</p>
          <a href="${escape(link)}" style="display:inline-block;background:#2f6fc0;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 22px;border-radius:6px;">Choose a new password</a>
          <p style="margin:20px 0 6px;font-size:13px;line-height:1.5;color:#5d6b7c;">If the button doesn't work, copy this link into your browser:</p>
          <p style="margin:0 0 20px;font-size:13px;line-height:1.5;word-break:break-all;"><a href="${escape(link)}" style="color:#2f6fc0;">${escape(link)}</a></p>
        </td></tr>
        <tr><td style="padding:16px 28px 24px;border-top:1px solid #eef1f5;font-size:13px;line-height:1.5;color:#5d6b7c;">If this wasn't you, ignore this email. Your password stays the same.</td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
  return { subject, text, html };
}

async function sendPasswordReset({ to, name, link, minutes }) {
  return sendMail({ to, ...passwordResetEmail({ name, link, minutes }) });
}

module.exports = { sendMail, sendPasswordReset, passwordResetEmail, verifyMailer };
