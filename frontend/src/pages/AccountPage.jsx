import { CheckCircle, GoogleLogo, Key, SignOut } from '@phosphor-icons/react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { PageHeader, Section } from '../components/ui/Layout';
import { ChangePasswordForm } from '../components/account/ChangePasswordForm';
import { roleLabel } from '../utils/format';

/** The signed-in user's own account: details and password (sign-in security settings join this page later). */
export function AccountPage() {
  const { user, logout } = useAuth();
  return (
    <>
      <PageHeader title="Your account" sub="Your details and sign-in security." />
      <div className="split">
        <div className="stack">
          {user?.has_password !== false ? (
            <Section id="password" title="Change password" variant="raised">
              <div className="account-form">
                <ChangePasswordForm />
              </div>
            </Section>
          ) : (
            <Section id="password" title="Password" variant="raised">
              <p>
                You sign in with Google, so this account has no password. To also be able to log in with your email and a
                password, log out and use <Link to="/forgot-password">Forgot password?</Link> to set one.
              </p>
            </Section>
          )}
          <Section id="sign-in" title="Sign-in methods" variant="raised">
            <ul className="sign-in-methods">
              <li>
                <Key size={18} aria-hidden="true" />
                <span>Email and password</span>
                <span className={`badge ${user?.has_password !== false ? 'badge--ok' : ''}`}>
                  {user?.has_password !== false ? 'Set' : 'Not set'}
                </span>
              </li>
              <li>
                <GoogleLogo size={18} aria-hidden="true" />
                <span>Google</span>
                <span className={`badge ${user?.google_linked ? 'badge--ok' : ''}`}>
                  {user?.google_linked ? (
                    <>
                      <CheckCircle size={14} weight="fill" aria-hidden="true" /> Connected
                    </>
                  ) : (
                    'Not connected'
                  )}
                </span>
              </li>
            </ul>
            {!user?.google_linked && (
              <p className="section__hint">To connect Google, log out and choose “Sign in with Google” with this email.</p>
            )}
          </Section>
        </div>
        <aside className="stack">
          <Section id="details" title="Details" variant="raised">
            <dl className="account-details">
              <div>
                <dt>Name</dt>
                <dd>{user?.full_name}</dd>
              </div>
              <div>
                <dt>Email</dt>
                <dd>{user?.email}</dd>
              </div>
              <div>
                <dt>Role</dt>
                <dd>{roleLabel(user?.role)}</dd>
              </div>
              {user?.staff_number && (
                <div>
                  <dt>Staff number</dt>
                  <dd className="num">{user.staff_number}</dd>
                </div>
              )}
              {user?.station && (
                <div>
                  <dt>Station</dt>
                  <dd>{user.station}</dd>
                </div>
              )}
            </dl>
            <p className="section__hint">Ask a supervisor if your name, email, staff number or station needs to change.</p>
            <button type="button" className="btn btn-secondary account-logout" onClick={logout}>
              <SignOut size={16} aria-hidden="true" />
              Log out
            </button>
          </Section>
        </aside>
      </div>
    </>
  );
}
