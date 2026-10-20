import { useEffect, useRef, useState } from 'react';
import { LinkSimple, WarningOctagon } from '@phosphor-icons/react';
import { useAuth } from '../../auth/useAuth';
import { GOOGLE_CLIENT_ID } from '../../config';
import { PasswordField } from '../PasswordField';
import { errorMessage } from '../../utils/format';

const SCRIPT_SRC = 'https://accounts.google.com/gsi/client';
let scriptPromise = null;
// Google Identity Services is initialised once per page; the current button's handler is kept here.
let onGoogleCredential = null;
let initialised = false;

function loadGoogleScript() {
  if (window.google?.accounts?.id) return Promise.resolve();
  scriptPromise ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error('Google sign-in could not be loaded'));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

/**
 * "Sign in with Google" for the log in and create-account pages. New Google users become ground
 * crew; if the email already has an account, its password is asked for once to link Google.
 * Renders nothing when VITE_GOOGLE_CLIENT_ID isn't set.
 */
export function GoogleSignIn({ text = 'signin_with', onLinkingChange }) {
  const { googleSignIn, linkGoogle } = useAuth();
  const buttonRef = useRef(null);
  const passwordRef = useRef(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState(null); // { ticket, email } while confirming a password
  const [unavailable, setUnavailable] = useState(false);

  // Lets the page hide its own email/password form while the link step is showing.
  useEffect(() => {
    onLinkingChange?.(Boolean(link));
  }, [link, onLinkingChange]);

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID || link) return undefined;
    let cancelled = false;
    onGoogleCredential = async ({ credential }) => {
      setError('');
      setBusy(true);
      try {
        const result = await googleSignIn(credential);
        if (result.linkRequired) setLink({ ticket: result.ticket, email: result.email });
        // Otherwise the session is set and GuestRoute moves on.
      } catch (err) {
        setError(errorMessage(err, 'Google sign-in didn’t work. Try again, or use your email and password.'));
      } finally {
        setBusy(false);
      }
    };
    loadGoogleScript()
      .then(() => {
        if (cancelled || !buttonRef.current) return;
        const id = window.google.accounts.id;
        if (!initialised) {
          id.initialize({
            client_id: GOOGLE_CLIENT_ID,
            callback: (response) => onGoogleCredential?.(response),
            ux_mode: 'popup',
            auto_select: false,
            cancel_on_tap_outside: true,
          });
          initialised = true;
        }
        const dark = document.documentElement.dataset.theme !== 'light';
        id.renderButton(buttonRef.current, {
          type: 'standard',
          theme: dark ? 'filled_black' : 'outline',
          size: 'large',
          shape: 'rectangular',
          text,
          logo_alignment: 'center',
          width: Math.min(400, Math.max(200, buttonRef.current.offsetWidth)),
        });
      })
      .catch(() => !cancelled && setUnavailable(true));
    return () => {
      cancelled = true;
      onGoogleCredential = null;
    };
  }, [googleSignIn, link, text]);

  async function confirmLink(event) {
    event.preventDefault();
    const password = String(new FormData(event.currentTarget).get('password') ?? '');
    if (!password) {
      setError('Enter the password for this account.');
      return passwordRef.current?.focus();
    }
    setError('');
    setBusy(true);
    try {
      await linkGoogle(link.ticket, password);
    } catch (err) {
      const expired = err.response?.status === 401 && /expired/i.test(err.response?.data?.error ?? '');
      if (expired) setLink(null);
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  if (!GOOGLE_CLIENT_ID) return null;

  const errorBox = error && (
    <p className="notice notice--critical" role="alert">
      <WarningOctagon size={18} weight="fill" aria-hidden="true" />
      <span>{error}</span>
    </p>
  );

  if (link) {
    return (
      <form className="auth-form google-link" onSubmit={confirmLink} noValidate>
        <p className="notice">
          <LinkSimple size={18} aria-hidden="true" />
          <span>
            An account already uses <strong>{link.email}</strong>. Enter its password once to link Google. After that, Google
            signs you in directly.
          </span>
        </p>
        <div aria-live="polite">{errorBox}</div>
        <input type="text" name="username" value={link.email} autoComplete="username" hidden readOnly />
        <PasswordField id="google-link-password" name="password" inputRef={passwordRef} label="Password" autoComplete="current-password" />
        <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
          {busy ? 'Linking…' : 'Link Google and log in'}
        </button>
        <button type="button" className="btn btn-ghost btn-block" onClick={() => setLink(null)} disabled={busy}>
          Cancel
        </button>
      </form>
    );
  }

  return (
    <div className="google-signin">
      <div className="auth-divider" role="separator">
        <span>or</span>
      </div>
      <div aria-live="polite">{errorBox}</div>
      {unavailable ? (
        <p className="field-hint">Google sign-in couldn’t load. Check the connection, or use your email and password.</p>
      ) : (
        <div ref={buttonRef} className="google-signin__button" aria-busy={busy || undefined} />
      )}
      {busy && <p className="field-hint" role="status">Signing in with Google…</p>}
    </div>
  );
}
