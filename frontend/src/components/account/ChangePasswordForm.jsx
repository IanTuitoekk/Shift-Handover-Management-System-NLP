import { useRef, useState } from 'react';
import { CheckCircle, WarningOctagon } from '@phosphor-icons/react';
import { useAuth } from '../../auth/useAuth';
import { PasswordField } from '../PasswordField';
import { errorMessage } from '../../utils/format';

/** Current password + new password (twice). Used for the forced change and on the Account page. */
export function ChangePasswordForm({ onDone, submitLabel = 'Change password', currentLabel = 'Current password' }) {
  const { changePassword } = useAuth();
  const currentRef = useRef(null);
  const nextRef = useRef(null);
  const confirmRef = useRef(null);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const current = String(data.get('current_password') ?? '');
    const next = String(data.get('new_password') ?? '');
    const confirm = String(data.get('confirm_password') ?? '');

    const e = {};
    if (!current) e.current = 'Enter your current password.';
    if (next.length < 8) e.next = 'Use at least 8 characters.';
    else if (next === current) e.next = 'Choose a password different from your current one.';
    if (confirm !== next) e.confirm = 'The two new passwords don’t match.';
    setErrors(e);
    setFormError('');
    setDone(false);
    if (e.current) return currentRef.current?.focus();
    if (e.next) return nextRef.current?.focus();
    if (e.confirm) return confirmRef.current?.focus();

    setSaving(true);
    try {
      await changePassword(current, next);
      form.reset();
      setDone(true);
      onDone?.();
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit} noValidate>
      <div aria-live="polite">
        {formError && (
          <p className="notice notice--critical" role="alert">
            <WarningOctagon size={18} weight="fill" aria-hidden="true" />
            <span>{formError}</span>
          </p>
        )}
        {done && (
          <p className="notice notice--ok">
            <CheckCircle size={18} weight="fill" aria-hidden="true" />
            <span>Password changed. You’ve been signed out on your other devices.</span>
          </p>
        )}
      </div>
      <PasswordField id="current-password" name="current_password" inputRef={currentRef} label={currentLabel} autoComplete="current-password" error={errors.current} />
      <PasswordField id="new-password" name="new_password" inputRef={nextRef} label="New password" hint="At least 8 characters." autoComplete="new-password" minLength={8} error={errors.next} />
      <PasswordField id="confirm-password" name="confirm_password" inputRef={confirmRef} label="Repeat new password" autoComplete="new-password" error={errors.confirm} />
      <button type="submit" className="btn btn-primary btn-block" disabled={saving}>
        {saving ? 'Saving…' : submitLabel}
      </button>
    </form>
  );
}
