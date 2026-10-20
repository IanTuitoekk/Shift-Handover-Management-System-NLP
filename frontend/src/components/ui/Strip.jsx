import { Link } from 'react-router-dom';
import { formatDateTime, formatTime } from '../../utils/format';

/**
 * The signature unit: a flight-progress-style strip.
 *   tone      'neutral' | 'accent' | 'critical' | 'ok'  (left status tab colour)
 *   icon      Phosphor icon for the status cell; `iconLabel` is its accessible name
 *   time      ISO timestamp shown in the mono time cell (or `timeText` to override)
 *   to        optional link for the title; the whole strip becomes clickable
 *   title     main line;  meta: secondary line;  aside: right-hand cell;  actions: controls row
 */
export function Strip({
  tone = 'neutral',
  icon: Icon,
  iconLabel,
  time,
  timeText,
  timeSub,
  to,
  title,
  meta,
  aside,
  actions,
  className = '',
  as: Tag = 'li',
  ...rest
}) {
  return (
    <Tag className={`strip strip--${tone} ${to ? 'strip--link' : ''} ${className}`} {...rest}>
      <span className="strip__icon" aria-hidden={iconLabel ? undefined : 'true'}>
        {Icon && <Icon size={20} weight={tone === 'critical' ? 'fill' : 'regular'} aria-hidden="true" />}
        {iconLabel && <span className="visually-hidden">{iconLabel}</span>}
      </span>
      {(time || timeText) && (
        <span className="strip__time">
          {time ? (
            <time className="num" dateTime={time} title={formatDateTime(time)}>
              {timeText ?? formatTime(time)}
            </time>
          ) : (
            <span className="num">{timeText}</span>
          )}
          {timeSub && <span className="strip__time-sub">{timeSub}</span>}
        </span>
      )}
      <div className="strip__main">
        <div className="strip__title">
          {to ? (
            <Link to={to} className="strip__link">
              {title}
            </Link>
          ) : (
            title
          )}
        </div>
        {meta && <div className="strip__meta">{meta}</div>}
      </div>
      {aside && <div className="strip__aside">{aside}</div>}
      {actions && <div className="strip__actions">{actions}</div>}
    </Tag>
  );
}

/** A well of strips. Pass `label` for screen readers when there is no visible heading. */
export function StripList({ children, label, className = '' }) {
  return (
    <ul className={`strip-list ${className}`} aria-label={label}>
      {children}
    </ul>
  );
}

export function StripSkeleton({ rows = 3 }) {
  return (
    <ul className="strip-list" aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <li key={i} className="strip strip--skeleton">
          <span className="strip__icon">
            <span className="skeleton" style={{ width: 20, height: 20 }} />
          </span>
          <span className="strip__time">
            <span className="skeleton" style={{ width: 44, height: 14 }} />
          </span>
          <div className="strip__main">
            <span className="skeleton" style={{ width: `${70 - i * 12}%`, height: 14 }} />
            <span className="skeleton" style={{ width: '40%', height: 12, marginTop: 8 }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
