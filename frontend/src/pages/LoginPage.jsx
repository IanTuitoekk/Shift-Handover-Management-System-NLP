import { useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { WarningOctagon } from '@phosphor-icons/react';
import { useAuth } from '../auth/useAuth';
import { AuthLayout } from './AuthLayout';
import { TextField } from '../components/TextField';
import { PasswordField } from '../components/PasswordField';
import { errorMessage } from '../utils/format';

export function LoginPage() {
  const { login } = useAuth();
  const location = useLocation();
  const emailRef = useRef(null);
  const passwordRef = useRef(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const email = String(data.get('email') ?? '').trim();
    const password = String(data.get('password') ?? '');

    const errors = {};
    if (!email) errors.email = 'Enter your work email.';
    if (!password) errors.password = 'Enter your password.';
    setFieldErrors(errors);
    setFormError('');
    if (errors.email) return emailRef.current?.focus();
    if (errors.password) return passwordRef.current?.focus();

    setSubmitting(true);
    try {
      // GuestRoute redirects once the session is set.
      await login(email, password);
    } catch (err) {
      const status = err.response?.status;
      setFormError(
        status === 401
          ? 'That email and password don’t match an account. Check both and try again.'
          : errorMessage(err),
      );
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout
      title="Log In"
      intro="Use your Kenya Airways work email."
      footer={
        <p>
          New to the handover system?{' '}
          <Link to="/register" state={location.state}>
            Create an Account
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
          id="login-email"
          inputRef={emailRef}
          label="Work email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="username"
          spellCheck={false}
          placeholder="name@kenya-airways.com…"
          error={fieldErrors.email}
        />

        <PasswordField
          id="login-password"
          inputRef={passwordRef}
          label="Password"
          autoComplete="current-password"
          error={fieldErrors.password}
        />

        <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
          {submitting ? 'Logging In…' : 'Log In'}
        </button>
      </form>
    </AuthLayout>
  );
}
