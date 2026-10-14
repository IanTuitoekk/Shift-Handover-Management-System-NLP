import { SignOut } from '@phosphor-icons/react';
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
          <Section id="password" title="Change password" variant="raised">
            <div className="account-form">
              <ChangePasswordForm />
            </div>
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
