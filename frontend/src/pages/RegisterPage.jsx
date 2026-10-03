import { useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { WarningOctagon } from '@phosphor-icons/react';
import { useAuth } from '../auth/useAuth';
import { AuthLayout } from './AuthLayout';
import { TextField } from '../components/TextField';
import { PasswordField } from '../components/PasswordField';
import { errorMessage } from '../utils/format';
import { ROLES } from '../config';

const ROLE_HINTS = {
  ground_crew: 'Submit handovers, resolve tasks',
  supervisor: 'Also assigns tasks to crew',
};

export function RegisterPage() {
  const { register } = useAuth();
  const location = useLocation();
  const fullNameRef = useRef(null);
  const emailRef = useRef(null);
  const passwordRef = useRef(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const values = {
      fullName: String(data.get('full_name') ?? '').trim(),
      email: String(data.get('email') ?? '').trim(),
      password: String(data.get('password') ?? ''),
      role: String(data.get('role') ?? ''),
    };

    const errors = {};
    if (!values.fullName) errors.fullName = 'Enter your full name.';
    if (!/^\S+@\S+\.\S+$/.test(values.email)) errors.email = 'Enter a valid email, like name@kenya-airways.com.';
    if (values.password.length < 8) errors.password = 'Use at least 8 characters.';
    setFieldErrors(errors);
    setFormError('');

    if (errors.fullName) return fullNameRef.current?.focus();
    if (errors.email) return emailRef.current?.focus();
    if (errors.password) return passwordRef.current?.focus();

    setSubmitting(true);
    try {
      await register(values);
    } catch (err) {
      const message = errorMessage(err);
      setFormError(
        /already exists/i.test(message) ? 'An account with this email already exists. Log in instead.' : message,
      );
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout
      title="Create an Account"
      intro="You’ll be logged in straight away."
      footer={
        <p>
          Already have an account?{' '}
          <Link to="/login" state={location.state}>
            Log In
          </Link>
        </p>
      }
    >
      <form className="auth-form" onSubmit={handleSubmit} noValidate>
        <div aria-live="polite">
          {formError && (
            <p className="alert alert-critical" role="alert">
              <WarningOctagon size={18} weight="fill" aria-hidden="true" />
              {formError}
            </p>
          )}
        </div>

        <TextField
          id="register-name"
          inputRef={fullNameRef}
          label="Full name"
          name="full_name"
          autoComplete="name"
          placeholder="e.g. Wanjiru Kamau…"
          error={fieldErrors.fullName}
        />

        <TextField
          id="register-email"
          inputRef={emailRef}
          label="Work email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          spellCheck={false}
          placeholder="name@kenya-airways.com…"
          error={fieldErrors.email}
        />

        <PasswordField
          id="register-password"
          inputRef={passwordRef}
          label="Password"
          hint="At least 8 characters."
          autoComplete="new-password"
          minLength={8}
          error={fieldErrors.password}
        />

        <fieldset className="role-options">
          <legend className="field-label">Role</legend>
          {ROLES.map((role, index) => (
            <label key={role.value} className="role-option">
              <input type="radio" name="role" value={role.value} defaultChecked={index === 0} />
              <span>
                {role.label}
                <small>{ROLE_HINTS[role.value]}</small>
              </span>
            </label>
          ))}
        </fieldset>

        <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
          {submitting ? 'Creating Account…' : 'Create Account'}
        </button>
      </form>
    </AuthLayout>
  );
}
