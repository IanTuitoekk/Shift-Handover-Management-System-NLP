import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { WarningOctagon } from '@phosphor-icons/react';
import { api } from '../api/client';
import { useAuth } from '../auth/useAuth';
import { AuthLayout } from './AuthLayout';
import { PasswordField } from '../components/PasswordField';
import { errorMessage } from '../utils/format';

/** Opened from the emailed link (/reset-password?token=…). */
export function ResetPasswordPage() {
  const navigate = useNavigate();
  const { signOut } = useAuth();
  // Read the token once, then take it out of the address bar and browser history.
  const [token] = useState(() => new URLSearchParams(window.location.search).get('token') ?? '');
  useEffect(() => {
    if (window.location.search) window.history.replaceState(window.history.state, '', window.location.pathname);
  }, []);

  const nextRef = useRef(null);
  const confirmRef = useRef(null);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const next = String(data.get('new_password') ?? '');
    const confirm = String(data.get('confirm_password') ?? '');
    const e = {};
    if (next.length < 8) e.next = 'Use at least 8 characters.';
    if (confirm !== next) e.confirm = 'The two passwords don’t match.';
    setErrors(e);
    setFormError('');
    if (e.next) return nextRef.current?.focus();
    if (e.confirm) return confirmRef.current?.focus();

    setSaving(true);
    try {
      await api.resetPassword(token, next);
      // Any session in this browser has just been ended by the server.
      signOut('Password changed. Log in with your new password.');
      navigate('/login', { replace: true });
    } catch (err) {
      setFormError(errorMessage(err));
      setSaving(false);
    }
  }

  return (
    <AuthLayout
      title="Choose a new password"
      intro={token ? 'This signs you out everywhere else.' : null}
      footer={
        <p>
          <Link to="/login">Back to log in</Link>
        </p>
      }
    >
      {!token ? (
        <div className="auth-form">
          <p className="notice notice--critical" role="alert">
            <WarningOctagon size={18} weight="fill" aria-hidden="true" />
            This link is incomplete. Open the link from the email again, or ask for a new one.
          </p>
          <Link to="/forgot-password" className="btn btn-primary btn-block">
            Ask for a new link
          </Link>
        </div>
      ) : (
        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          <div aria-live="polite">
            {formError && (
              <p className="notice notice--critical" role="alert">
                <WarningOctagon size={18} weight="fill" aria-hidden="true" />
                <span>
                  {formError} {/expired|invalid/i.test(formError) && <Link to="/forgot-password">Ask for a new link</Link>}
                </span>
              </p>
            )}
          </div>
          {/* Lets password managers save the new password against the right account. */}
          <input type="text" name="username" autoComplete="username" hidden readOnly />
          <PasswordField
            id="reset-new-password"
            name="new_password"
            inputRef={nextRef}
            label="New password"
            hint="At least 8 characters."
            autoComplete="new-password"
            minLength={8}
            error={errors.next}
          />
          <PasswordField
            id="reset-confirm-password"
            name="confirm_password"
            inputRef={confirmRef}
            label="Repeat new password"
            autoComplete="new-password"
            error={errors.confirm}
          />
          <button type="submit" className="btn btn-primary btn-block" disabled={saving}>
            {saving ? 'Saving…' : 'Save new password'}
          </button>
        </form>
      )}
    </AuthLayout>
  );
}
