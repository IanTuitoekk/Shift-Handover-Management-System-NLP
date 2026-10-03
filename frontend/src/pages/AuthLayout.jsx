import './auth.css';

export function AuthLayout({ title, intro, children, footer }) {
  return (
    <div className="auth">
      <aside className="auth-band">
        <p className="auth-brand" translate="no">
          Kenya Airways
        </p>
        <div className="auth-band-copy">
          <p className="auth-product">Shift Handover</p>
          <p className="auth-tagline">
            Record handovers in English or Swahili. Tasks and alerts are raised automatically for the incoming
            crew.
          </p>
        </div>
      </aside>

      <main className="auth-main" id="main">
        <div className="auth-card">
          <h1 className="auth-title">{title}</h1>
          {intro && <p className="auth-intro">{intro}</p>}
          {children}
          {footer && <div className="auth-footer">{footer}</div>}
        </div>
      </main>
    </div>
  );
}
