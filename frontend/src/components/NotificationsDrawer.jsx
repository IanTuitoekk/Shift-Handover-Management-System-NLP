import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { BellSlash, X } from '@phosphor-icons/react';
import { formatDateTime, formatRelative } from '../utils/format';

export function NotificationsDrawer({ open, onClose, notifications, loading, error, onRetry, onMarkRead }) {
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
      aria-labelledby="notifications-title"
      onClose={onClose}
      onClick={(event) => {
        // Clicking the backdrop (the dialog element itself) closes the drawer.
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="drawer-inner">
        <div className="drawer-header">
          <h2 id="notifications-title" className="panel-title">
            Notifications
          </h2>
          <div className="drawer-header-actions">
            {unread.length > 0 && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => onMarkRead(unread.map((n) => n.notif_id))}
              >
                Mark All as Read
              </button>
            )}
            <button type="button" className="icon-btn" onClick={onClose} aria-label="Close notifications">
              <X size={20} aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="drawer-body">
          {loading && (
            <div className="stack-skeleton" role="status" aria-label="Loading notifications…">
              {[0, 1, 2].map((i) => (
                <span key={i} className="skeleton" style={{ height: '4.5rem' }} />
              ))}
            </div>
          )}

          {error && !loading && list.length === 0 && (
            <div className="empty">
              <strong>Couldn’t load notifications</strong>
              <p>Check your connection, then try again.</p>
              <button type="button" className="btn btn-secondary btn-sm" onClick={onRetry}>
                Try Again
              </button>
            </div>
          )}

          {!loading && !error && list.length === 0 && (
            <div className="empty">
              <BellSlash size={28} aria-hidden="true" />
              <strong>No notifications</strong>
              <p>You’ll be alerted here when a new handover is processed.</p>
            </div>
          )}

          {list.length > 0 && (
            <ul className="notif-list">
              {list.map((n) => (
                <li key={n.notif_id} className={`notif ${n.is_read ? '' : 'notif-unread'}`}>
                  <p className="notif-message">
                    {!n.is_read && <span className="visually-hidden">Unread: </span>}
                    {n.message}
                  </p>
                  <div className="notif-meta">
                    <time dateTime={n.sent_at} title={formatDateTime(n.sent_at)}>
                      {formatRelative(n.sent_at)}
                    </time>
                    <div className="notif-actions">
                      <Link
                        to={`/reports/${n.report_id}`}
                        className="btn btn-ghost btn-sm"
                        onClick={() => {
                          if (!n.is_read) onMarkRead([n.notif_id]);
                          onClose();
                        }}
                      >
                        Open Report
                      </Link>
                      {!n.is_read && (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => onMarkRead([n.notif_id])}
                        >
                          Mark as Read
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </dialog>
  );
}
