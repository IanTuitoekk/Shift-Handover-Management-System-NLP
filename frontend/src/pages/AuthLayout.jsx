import { ListChecks, SquaresFour } from '@phosphor-icons/react';
import { Link } from 'react-router-dom';
import { PHOTOS } from '../assets/photos';
import './auth.css';

export function AuthLayout({ title, intro, children, footer }) {
  return (
    <div className="auth shell--ground">
      <aside className="auth-band">
        <img
          className="auth-band__img"
          src={PHOTOS.login.src}
          width={PHOTOS.login.width}
          height={PHOTOS.login.height}
          alt=""
          fetchPriority="high"
          decoding="async"
        />
        <div className="auth-band__scrim" aria-hidden="true" />
        <p className="auth-brand" translate="no">
          Kenya Airways
        </p>
        <div className="auth-band-copy">
          <p className="auth-product">Shift Handover</p>
          <p className="auth-tagline">
            Record handovers in English or Swahili. Tasks and alerts are raised automatically for the incoming crew.
          </p>
          <ul className="auth-roles" aria-label="What each role sees">
            <li>
              <ListChecks size={18} aria-hidden="true" />
              <strong>Ground crew</strong>
              <span>Write handovers, see your tasks, read the previous shift.</span>
            </li>
            <li>
              <SquaresFour size={18} aria-hidden="true" />
              <strong>Supervisor</strong>
              <span>See what needs attention, review, and assign work.</span>
            </li>
          </ul>
        </div>
      </aside>

      <main className="auth-main" id="main">
        <div className="auth-card">
          <h1 className="auth-title">{title}</h1>
          {intro && <p className="auth-intro">{intro}</p>}
          {children}
          {footer && <div className="auth-footer">{footer}</div>}
          <p className="auth-credits">
            <Link to="/credits">Photo credits</Link>
          </p>
        </div>
      </main>
    </div>
  );
}
