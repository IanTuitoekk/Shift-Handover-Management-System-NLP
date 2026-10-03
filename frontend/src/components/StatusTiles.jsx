import { Bell, ClipboardText, ListChecks, WarningOctagon } from '@phosphor-icons/react';
import { LOW_CONFIDENCE_THRESHOLD, STATS_WINDOW } from '../config';
import { formatPercent } from '../utils/format';

function Tile({ icon: Icon, label, value, detail, critical, loading, action }) {
  return (
    <div className={`tile ${critical ? 'tile-critical' : ''}`}>
      <div className="tile-head">
        <span className="tile-label">{label}</span>
        <Icon size={20} weight={critical ? 'fill' : 'regular'} aria-hidden="true" className="tile-icon" />
      </div>
      {loading ? (
        <span className="skeleton" style={{ height: '2.25rem', width: '4rem' }} />
      ) : (
        <span className="tile-value num">{value}</span>
      )}
      <div className="tile-detail">{loading ? <span className="skeleton" style={{ height: '1rem' }} /> : detail}</div>
      {action}
    </div>
  );
}

export function StatusTiles({ shiftName, stats, loading, onOpenNotifications }) {
  const { reportsThisShift, windowFull, openTasks, overdueTasks, needsReview, unread } = stats;

  return (
    <section className="tiles" aria-label="Shift status">
      <Tile
        icon={ClipboardText}
        label="Reports This Shift"
        value={windowFull ? `${reportsThisShift}+` : reportsThisShift}
        detail={`Since the ${shiftName.toLowerCase()} shift started`}
        loading={loading.reports}
      />
      <Tile
        icon={overdueTasks > 0 ? WarningOctagon : ListChecks}
        label="Open Tasks"
        value={openTasks}
        critical={overdueTasks > 0}
        detail={overdueTasks > 0 ? `${overdueTasks} overdue` : 'None overdue'}
        loading={loading.tasks}
      />
      <Tile
        icon={WarningOctagon}
        label="Needs Review"
        value={needsReview}
        critical={needsReview > 0}
        detail={`Below ${formatPercent(LOW_CONFIDENCE_THRESHOLD)} confidence, latest ${STATS_WINDOW} reports`}
        loading={loading.reports}
      />
      <Tile
        icon={Bell}
        label="Unread Alerts"
        value={unread}
        detail={unread > 0 ? 'New handovers since you last checked' : 'You’re up to date'}
        loading={loading.notifications}
        action={
          unread > 0 && (
            <button type="button" className="tile-action" onClick={onOpenNotifications}>
              View Alerts
            </button>
          )
        }
      />
    </section>
  );
}
