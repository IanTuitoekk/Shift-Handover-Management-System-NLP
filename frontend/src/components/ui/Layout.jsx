import { ArrowClockwise, WarningOctagon } from '@phosphor-icons/react';

export function PageHeader({ title, sub, actions, children }) {
  return (
    <header className="page-header">
      <div className="page-header__text">
        <h1 className="page-title">{title}</h1>
        {sub && <p className="page-sub">{sub}</p>}
      </div>
      {actions && <div className="page-header__actions">{actions}</div>}
      {children}
    </header>
  );
}

/**
 * A titled region. `variant="raised"` puts it on a raised surface; the default is flat on the
 * page so not everything becomes a card.
 */
export function Section({ id, title, count, action, variant = 'flat', className = '', children, headingLevel = 2 }) {
  const Heading = `h${headingLevel}`;
  const titleId = id ? `${id}-title` : undefined;
  return (
    <section id={id} className={`section section--${variant} ${className}`} aria-labelledby={titleId}>
      {title && (
        <div className="section__head">
          <Heading id={titleId} className="section__title">
            {title}
            {count !== undefined && count !== null && <span className="count">{count}</span>}
          </Heading>
          {action && <div className="section__action">{action}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

/** `art` (an image URL) replaces the icon spot with an illustration when one is available. */
export function EmptyState({ icon: Icon, art, title, children, action }) {
  return (
    <div className="empty-state">
      {(art || Icon) && (
        <span className={`empty-state__spot ${art ? 'empty-state__spot--art' : ''}`} aria-hidden="true">
          {art ? <img src={art} alt="" width={112} height={112} loading="lazy" /> : <Icon size={28} />}
        </span>
      )}
      <p className="empty-state__title">{title}</p>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ message = 'Couldn’t load this.', onRetry }) {
  return (
    <div className="error-state" role="alert">
      <WarningOctagon size={18} weight="fill" aria-hidden="true" />
      <span>{message}</span>
      {onRetry && (
        <button type="button" className="btn btn-secondary" onClick={onRetry}>
          <ArrowClockwise size={16} aria-hidden="true" />
          Try again
        </button>
      )}
    </div>
  );
}
