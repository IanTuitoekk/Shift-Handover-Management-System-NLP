import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { EnvelopeSimple, WarningOctagon } from '@phosphor-icons/react';
import { api } from '../api/client';
import { AuthLayout } from './AuthLayout';
import { TextField } from '../components/TextField';
import { errorMessage } from '../utils/format';

/** "Forgot password": asks for the work email and sends a one-time reset link. */
export function ForgotPasswordPage() {
  const emailRef = useRef(null);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [sentTo, setSentTo] = useState('');
  const [sending, setSending] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    const email = String(new FormData(event.currentTarget).get('email') ?? '').trim();
    setFormError('');
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setError('Enter your work email, like name@kenya-airways.com.');
      return emailRef.current?.focus();
    }
    setError('');
    setSending(true);
    try {
      await api.forgotPassword(email);
      setSentTo(email);
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setSending(false);
    }
  }

  return (
    <AuthLayout
      title="Reset your password"
      intro={sentTo ? null : 'Enter your work email and we’ll send you a link to choose a new password.'}
      footer={
        <p>
          Remembered it? <Link to="/login">Back to log in</Link>
        </p>
      }
    >
      {sentTo ? (
        <div className="auth-form" role="status">
          <p className="notice notice--ok">
            <EnvelopeSimple size={18} aria-hidden="true" />
            <span>
              If <strong>{sentTo}</strong> belongs to an active account, a reset link is on its way. It works once and expires
              in 30 minutes.
            </span>
          </p>
          <p className="field-hint">No email after a few minutes? Check spam, or ask your supervisor to confirm the email on your account.</p>
          <button type="button" className="btn btn-secondary btn-block" onClick={() => setSentTo('')}>
            Use a different email
          </button>
        </div>
      ) : (
        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          <div aria-live="polite">
            {formError && (
              <p className="notice notice--critical" role="alert">
                <WarningOctagon size={18} weight="fill" aria-hidden="true" />
                {formError}
              </p>
            )}
          </div>
          <TextField
            id="forgot-email"
            inputRef={emailRef}
            label="Work email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="username"
            spellCheck={false}
            placeholder="name@kenya-airways.com…"
            error={error}
          />
          <button type="submit" className="btn btn-primary btn-block" disabled={sending}>
            {sending ? 'Sending…' : 'Send reset link'}
          </button>
        </form>
      )}
    </AuthLayout>
  );
}
