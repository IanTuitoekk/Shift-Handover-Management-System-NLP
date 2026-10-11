import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, BellSimpleSlash, CheckCircle, Sun } from '@phosphor-icons/react';
import { useShell } from '../../components/shell/ShellContext';
import { Composer } from '../../components/composer/Composer';
import { ShiftRail } from '../../components/ui/ShiftRail';
import { Section, EmptyState, ErrorState } from '../../components/ui/Layout';
import { PhotoBanner } from '../../components/ui/PhotoBanner';
import { PHOTOS } from '../../assets/photos';
import { StripList, StripSkeleton } from '../../components/ui/Strip';
import { TaskStrip } from '../../components/tasks/TaskStrip';
import { AlertStrips } from '../../components/NotificationsDrawer';
import { useMyReports } from '../../hooks/useData';
import { firstName, formatAge, formatTime, inShift, isOverdue, previousShift, shiftAt } from '../../utils/format';
import { myShiftEvents } from './events';

const BRIEFING_LIMIT = 4;

export function GroundHome() {
  const { me, now, tasks, notifications, markRead, resolveTask, applyTaskUpdate, refreshAll } = useShell();
  const myReports = useMyReports();
  const shift = shiftAt(now);
  const prev = previousShift(now);
  const t = now.getTime();

  const pending = useMemo(() => (tasks.data ?? []).filter((x) => x.status === 'pending'), [tasks.data]);
  const byUrgency = (a, b) => Number(isOverdue(b, t)) - Number(isOverdue(a, t)) || new Date(a.created_at) - new Date(b.created_at);
  const mine = pending.filter((x) => x.assigned_to === me.user_id).sort(byUrgency);
  const overdueUnassigned = pending.filter((x) => !x.assigned_to && isOverdue(x, t)).sort(byUrgency);

  const allAlerts = notifications.data ?? [];
  const fromPrevious = allAlerts
    .filter((n) => inShift(n.sent_at, prev))
    .sort((a, b) => Number(a.is_read) - Number(b.is_read) || new Date(b.sent_at) - new Date(a.sent_at));
  const unreadPrevious = fromPrevious.filter((n) => !n.is_read);
  const olderUnread = allAlerts.filter((n) => !n.is_read && new Date(n.sent_at) < prev.start).length;

  const events = myShiftEvents({ myReports: myReports.data?.reports, tasks: tasks.data ?? [], me });
  const tasksLoading = tasks.data === undefined && !tasks.error;

  function onSubmitted() {
    myReports.reload();
    refreshAll();
  }

  return (
    <>
      <PhotoBanner
        photo={PHOTOS.groundHome}
        title={`${shift.name} shift`}
        sub={
          <>
            Started <span className="num">{formatTime(shift.start)}</span>, <span className="num">{formatAge(shift.start, now)}</span> in.
            Hello {firstName(me.full_name)}.
          </>
        }
      />
      <ShiftRail
        now={now}
        events={events}
        summary={`Shift rail. ${events.filter((e) => inShift(e.at, shift)).length} of your events this shift.`}
      />

      <div className="home-grid">
        <section className="panel composer-panel" aria-labelledby="composer-title">
          <Composer userId={me.user_id} onSubmitted={onSubmitted} />
        </section>

        <div className="briefing" aria-label="Your briefing">
          <h2 className="briefing__title">Your briefing</h2>

          <Section
            id="brief-mine"
            title="Assigned to you"
            count={tasks.data ? mine.length : undefined}
            headingLevel={3}
            action={
              mine.length > BRIEFING_LIMIT && (
                <Link to="/my-tasks" className="btn btn-ghost">
                  All {mine.length} <ArrowRight size={16} aria-hidden="true" />
                </Link>
              )
            }
          >
            {tasksLoading && <StripSkeleton rows={2} />}
            {tasks.error && !tasks.data && <ErrorState message="Couldn’t load your tasks." onRetry={tasks.reload} />}
            {tasks.data && mine.length === 0 && (
              <EmptyState icon={CheckCircle} title="Nothing assigned to you">
                Your supervisor assigns tasks from new handovers. Open tasks anyone can pick up are in My tasks.
              </EmptyState>
            )}
            {mine.length > 0 && (
              <StripList>
                {mine.slice(0, BRIEFING_LIMIT).map((task) => (
                  <TaskStrip key={task.task_id} task={task} now={now} currentUserId={me.user_id} onResolve={resolveTask} onResolved={applyTaskUpdate} />
                ))}
              </StripList>
            )}
          </Section>

          {overdueUnassigned.length > 0 && (
            <Section id="brief-overdue" title="Overdue, not assigned to anyone" count={overdueUnassigned.length} headingLevel={3}>
              <StripList>
                {overdueUnassigned.slice(0, BRIEFING_LIMIT).map((task) => (
                  <TaskStrip key={task.task_id} task={task} now={now} currentUserId={me.user_id} onResolve={resolveTask} onResolved={applyTaskUpdate} />
                ))}
              </StripList>
            </Section>
          )}

          <Section
            id="brief-previous"
            title={`From the ${prev.name.toLowerCase()} shift`}
            count={notifications.data ? unreadPrevious.length : undefined}
            headingLevel={3}
            action={
              unreadPrevious.length > 1 && (
                <button type="button" className="btn btn-ghost" onClick={() => markRead(unreadPrevious.map((n) => n.notif_id))}>
                  Mark all as read
                </button>
              )
            }
          >
            {notifications.data === undefined && !notifications.error && <StripSkeleton rows={2} />}
            {notifications.error && !notifications.data && <ErrorState message="Couldn’t load handovers to read." onRetry={notifications.reload} />}
            {notifications.data && fromPrevious.length === 0 && (
              <EmptyState icon={prev.name === 'Day' ? Sun : BellSimpleSlash} title={`No handovers from the ${prev.name.toLowerCase()} shift`}>
                {olderUnread > 0 ? `You have ${olderUnread} older unread alert${olderUnread === 1 ? '' : 's'}.` : 'You’re up to date.'}
              </EmptyState>
            )}
            {fromPrevious.length > 0 && <AlertStrips notifications={fromPrevious} onMarkRead={markRead} now={now} />}
            {olderUnread > 0 && (
              <p className="briefing__more">
                <Link to="/alerts">
                  See all alerts <ArrowRight size={14} aria-hidden="true" />
                </Link>
              </p>
            )}
          </Section>
        </div>
      </div>
    </>
  );
}
