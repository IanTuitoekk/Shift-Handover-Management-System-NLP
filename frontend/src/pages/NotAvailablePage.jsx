import { Link } from 'react-router-dom';
import { ArrowLeft, LockSimple } from '@phosphor-icons/react';
import { useAuth } from '../auth/useAuth';
import { roleConfig } from '../roles';

export function NotAvailablePage() {
  const { user } = useAuth();
  const config = roleConfig(user?.role);
  return (
    <div className="not-available">
      <LockSimple size={32} aria-hidden="true" />
      <h1 className="page-title">Not available for your role</h1>
      <p className="page-sub">
        This page is part of the {config.label === 'Supervisor' ? 'ground crew' : 'supervisor'} view. You’re signed in as{' '}
        {config.label.toLowerCase()}, so it isn’t shown here. If you need it, ask your shift lead.
      </p>
      <Link to="/" className="btn btn-primary">
        <ArrowLeft size={16} aria-hidden="true" />
        Back to {config.nav[0].label.toLowerCase()}
      </Link>
    </div>
  );
}
