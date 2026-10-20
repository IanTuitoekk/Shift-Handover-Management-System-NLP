import { useSearchParams } from 'react-router-dom';
import { BellSimpleSlash, Checks } from '@phosphor-icons/react';
import { useShell } from '../../components/shell/ShellContext';
import { PageHeader, EmptyState, ErrorState } from '../../components/ui/Layout';
import { StripSkeleton } from '../../components/ui/Strip';
import { AlertStrips } from '../../components/NotificationsDrawer';

export function AlertsPage() {
  const { now, notifications, markRead } = useShell();
  const [params, setParams] = useSearchParams();
  const show = params.get('show') === 'all' ? 'all' : 'unread';
  const all = notifications.data ?? [];
  const unread = all.filter((n) => !n.is_read);
  const list = show === 'all' ? all : unread;

  return (
    <>
      <PageHeader
        title="Alerts"
        sub={notifications.data ? <><span className="num">{unread.length}</span> unread of <span className="num">{all.length}</span></> : 'Loading alerts…'}
        actions={
          unread.length > 0 && (
            <button type="button" className="btn btn-secondary" onClick={() => markRead(unread.map((n) => n.notif_id))}>
              <Checks size={18} aria-hidden="true" />
              Mark all as read
            </button>
          )
        }
      />
      <div className="segmented" role="group" aria-label="Which alerts">
        {[
          ['unread', `Unread`, unread.length],
          ['all', 'All', all.length],
        ].map(([value, label, count]) => (
          <button
            key={value}
            type="button"
            aria-pressed={show === value}
            className="segmented__btn"
            onClick={() => setParams(value === 'unread' ? {} : { show: value }, { replace: true })}
          >
            {label} <span className="count">{count}</span>
          </button>
        ))}
      </div>
      <div className="narrow">
        {notifications.data === undefined && !notifications.error && <StripSkeleton rows={5} />}
        {notifications.error && !notifications.data && <ErrorState message="Couldn’t load alerts." onRetry={notifications.reload} />}
        {notifications.data && list.length === 0 && (
          <EmptyState
            icon={BellSimpleSlash}
            title={show === 'unread' ? 'No unread alerts' : 'No alerts yet'}
            action={
              show === 'unread' &&
              all.length > 0 && (
                <button type="button" className="btn btn-secondary" onClick={() => setParams({ show: 'all' }, { replace: true })}>
                  Show all alerts
                </button>
              )
            }
          >
            New handovers raise an alert here for every crew member.
          </EmptyState>
        )}
        {list.length > 0 && <AlertStrips notifications={list} onMarkRead={markRead} now={now} />}
      </div>
    </>
  );
}
