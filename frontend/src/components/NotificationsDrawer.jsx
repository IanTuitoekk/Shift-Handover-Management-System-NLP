import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { BellSlash, Bell, X } from '@phosphor-icons/react';
import { formatAge, formatTime } from '../utils/format';
import { Strip, StripList, StripSkeleton } from './ui/Strip';
import { EmptyState, ErrorState } from './ui/Layout';

/** Alerts as strips. Shared by the drawer and the ground crew Alerts page. */
export function AlertStrips({ notifications, onMarkRead, onOpen, now }) {
  return (
    <StripList label="Alerts">
      {notifications.map((n) => (
        <Strip
          key={n.notif_id}
          tone={n.is_read ? 'neutral' : 'accent'}
          icon={Bell}
          iconLabel={n.is_read ? 'Read' : 'Unread'}
          time={n.sent_at}
          timeSub={<span className="age">{formatAge(n.sent_at, now)}</span>}
          className={n.is_read ? 'strip--read' : ''}
          title={
            <Link
              to={`/reports/${n.report_id}`}
              className="strip__link"
              onClick={() => {
                if (!n.is_read) onMarkRead([n.notif_id]);
                onOpen?.();
              }}
            >
              {n.message}
            </Link>
          }
          actions={
            !n.is_read && (
              <button type="button" className="btn btn-ghost" onClick={() => onMarkRead([n.notif_id])}>
                Mark as read
              </button>
            )
          }
        />
      ))}
    </StripList>
  );
}

export function NotificationsDrawer({ open, onClose, notifications, loading, error, onRetry, onMarkRead, now }) {
  const dialogRef = useRef(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const list = notifications ?? [];
  const unread = list.filter((n) => !n.is_read);

  return (
    <dialog
      ref={dialogRef}
      className="drawer"
      aria-labelledby="drawer-title"
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="drawer__inner">
        <div className="drawer__head">
          <h2 id="drawer-title" className="section__title">
            Alerts {unread.length > 0 && <span className="count count--accent">{unread.length}</span>}
          </h2>
          <div className="drawer__actions">
            {unread.length > 0 && (
              <button type="button" className="btn btn-ghost" onClick={() => onMarkRead(unread.map((n) => n.notif_id))}>
                Mark all as read
              </button>
            )}
            <button type="button" className="icon-btn" onClick={onClose} aria-label="Close alerts">
              <X size={20} aria-hidden="true" />
            </button>
          </div>
        </div>
        <div className="drawer__body">
          {loading && <StripSkeleton rows={4} />}
          {error && !loading && list.length === 0 && (
            <ErrorState message="Couldn’t load alerts." onRetry={onRetry} />
          )}
          {!loading && !error && list.length === 0 && (
            <EmptyState icon={BellSlash} title="No alerts">
              You’ll be alerted here when a new handover is processed.
            </EmptyState>
          )}
          {list.length > 0 && (
            <AlertStrips notifications={list} onMarkRead={onMarkRead} onOpen={onClose} now={now} />
          )}
        </div>
        <p className="drawer__foot field-hint">
          Latest at <span className="num">{list[0] ? formatTime(list[0].sent_at) : '--:--'}</span>
        </p>
      </div>
    </dialog>
  );
}
