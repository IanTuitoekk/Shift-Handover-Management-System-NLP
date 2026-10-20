const { passwordResetEmail, sendMail } = require('../utils/mailer');

describe('password reset email', () => {
  const email = passwordResetEmail({
    name: 'Amina <script>',
    link: 'http://localhost:5173/reset-password?token=abc&x=1',
    minutes: 30,
  });

  test('has a subject, a plain-text and an HTML version with the link', () => {
    expect(email.subject).toBe('Reset your Shift Handover password');
    expect(email.text).toContain('http://localhost:5173/reset-password?token=abc&x=1');
    expect(email.text).toContain('30 minutes');
    expect(email.html).toContain('href="http://localhost:5173/reset-password?token=abc&amp;x=1"');
    expect(email.html).toContain('Choose a new password');
  });

  test('escapes the name in the HTML', () => {
    expect(email.html).toContain('Amina &lt;script&gt;');
    expect(email.html).not.toContain('<script>');
  });

  test('without SMTP_HOST the email is printed, not sent', async () => {
    const saved = process.env.SMTP_HOST;
    delete process.env.SMTP_HOST;
    const log = jest.spyOn(console, 'info').mockImplementation(() => {});
    await expect(sendMail({ to: 'a@b.co', subject: 'S', text: 'T' })).resolves.toEqual({ printed: true });
    expect(log.mock.calls[0][0]).toContain('not sent');
    log.mockRestore();
    if (saved !== undefined) process.env.SMTP_HOST = saved;
  });
});
