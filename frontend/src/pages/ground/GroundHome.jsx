import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, ArrowsLeftRight, BellSimpleSlash, CheckCircle, Sun } from '@phosphor-icons/react';
import { api } from '../../api/client';
import { useResource } from '../../hooks/useResource';
import { SHIFT_PLANS_CHANGED } from '../../hooks/useRealtime';
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
import { firstName, formatAge, formatTime, inShift, byDue, isOverdue, previousShift, shiftAt, shiftTitle, formatWeekdayDay } from '../../utils/format';
import { myShiftEvents } from './events';

const BRIEFING_LIMIT = 4;

export function GroundHome() {
  const { me, now, tasks, notifications, markRead, markTaskDone, applyTaskUpdate, refreshAll } = useShell();
  const myReports = useMyReports();
  const location = useLocation();
  const navigate = useNavigate();
  // Draw the eye to the form once per session, and whenever someone uses "Write handover".
  const [firstVisit] = useState(() => {
    try {
      return !sessionStorage.getItem('kq-compose-seen');
    } catch {
      return true; // storage unavailable; treat as a first visit
    }
  });
  useEffect(() => {
    try {
      sessionStorage.setItem('kq-compose-seen', '1');
    } catch {
      // ignore
    }
  }, []);
  const [ended, setEnded] = useState({ once: false, key: null });
  const composeRequested = Boolean(location.state?.compose);
  const highlight = composeRequested ? ended.key !== location.key : firstVisit && !ended.once;

  // Arriving from "Write handover": bring the form into view and put the cursor in it.
  useEffect(() => {
    if (!composeRequested) return;
    document.getElementById('compose')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    document.getElementById('composer-title-text')?.focus({ preventScroll: true });
  }, [composeRequested, location.key]);

  function handleGlowEnd(event) {
    if (event.target !== event.currentTarget) return; // ignore animations inside the form
    setEnded({ once: true, key: location.key });
    // Clear the request so a reload doesn't replay it.
    if (composeRequested) navigate('.', { replace: true, state: null });
  }
  const shift = shiftAt(now);
  const prev = previousShift(now);
  const t = now.getTime();

  const pending = useMemo(() => (tasks.data ?? []).filter((x) => x.status === 'pending'), [tasks.data]);
  const byUrgency = (a, b) => byDue(a, b, t);
  // Tasks still to do first; ones marked done (waiting for sign-off) after them.
  const mine = pending.filter((x) => x.assigned_to === me.user_id).sort((a, b) => Number(Boolean(a.done_at)) - Number(Boolean(b.done_at)) || byUrgency(a, b));
  const overdueUnassigned = pending.filter((x) => !x.assigned_to && isOverdue(x, t)).sort(byUrgency);

  const allAlerts = notifications.data ?? [];
  const fromPrevious = allAlerts
    .filter((n) => inShift(n.sent_at, prev))
    .sort((a, b) => Number(a.is_read) - Number(b.is_read) || new Date(b.sent_at) - new Date(a.sent_at));
  const unreadPrevious = fromPrevious.filter((n) => !n.is_read);
  const olderUnread = allAlerts.filter((n) => !n.is_read && (!prev || new Date(n.sent_at) < prev.start)).length;

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
        title={shift ? shiftTitle(shift.name) : 'No shift'}
        sub={
          shift ? (
            <>
              Started <span className="num">{formatTime(shift.start)}</span>, <span className="num">{formatAge(shift.start, now)}</span> in.
              Hello {firstName(me.full_name)}.
            </>
          ) : (
            <>No shift is running now. Hello {firstName(me.full_name)}.</>
          )
        }
      />
      <ShiftRail
        now={now}
        events={events}
        summary={`Shift rail. ${events.filter((e) => inShift(e.at, shift)).length} of your events this shift.`}
      />

      <div className="home-grid">
        <section
          id="compose"
          className={`panel composer-panel ${highlight ? 'composer-panel--highlight' : ''}`}
          aria-labelledby="composer-title"
          onAnimationEnd={handleGlowEnd}
        >
          <Composer userId={me.user_id} onSubmitted={onSubmitted} />
        </section>

        <div className="briefing" aria-label="Your briefing">
          <h2 className="briefing__title">Your briefing</h2>

          <HandoverPartners />

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
                Tasks from the outgoing shift’s handovers are shared out automatically to the incoming shift. Your supervisor can also assign you work.
              </EmptyState>
            )}
            {mine.length > 0 && (
              <StripList>
                {mine.slice(0, BRIEFING_LIMIT).map((task) => (
                  <TaskStrip key={task.task_id} task={task} now={now} currentUserId={me.user_id} onMarkDone={markTaskDone} onUpdated={applyTaskUpdate} />
                ))}
              </StripList>
            )}
          </Section>

          {overdueUnassigned.length > 0 && (
            <Section id="brief-overdue" title="Overdue, not assigned to anyone" count={overdueUnassigned.length} headingLevel={3}>
              <StripList>
                {overdueUnassigned.slice(0, BRIEFING_LIMIT).map((task) => (
                  <TaskStrip key={task.task_id} task={task} now={now} currentUserId={me.user_id} />
                ))}
              </StripList>
            </Section>
          )}

          <Section
            id="brief-previous"
            title={prev ? `From the ${shiftTitle(prev.name)}` : 'From the previous shift'}
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
              <EmptyState icon={prev && prev.start.getHours() >= 5 && prev.start.getHours() < 17 ? Sun : BellSimpleSlash} title={prev ? `No handovers from the ${shiftTitle(prev.name)}` : 'No handovers from a previous shift'}>
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

/** From the supervisor's shift plans: who this person takes over from, and who takes over from them. */
function HandoverPartners() {
  const { data, reload } = useResource('shift-plans:me', () => api.myShiftPlans());
  useEffect(() => {
    window.addEventListener(SHIFT_PLANS_CHANGED, reload);
    return () => window.removeEventListener(SHIFT_PLANS_CHANGED, reload);
  }, [reload]);
  const lines = (data ?? []).flatMap((s) => {
    const when = `${s.current ? 'this' : 'the'} ${shiftTitle(s.name)} (${formatWeekdayDay(s.start)})`;
    const out = [];
    if (s.on_shift) out.push(s.takes_over_from ? `On ${when}, you take over from ${s.takes_over_from.full_name}.` : `You’re planned on ${when}.`);
    if (s.taken_over_by.length) {
      const names = s.taken_over_by.map((p) => p.full_name).join(' and ');
      out.push(`${names} ${s.taken_over_by.length === 1 ? 'takes' : 'take'} over from you on ${when}, so your handover tasks go to ${s.taken_over_by.length === 1 ? 'them' : 'one of them'}.`);
    }
    return out.map((text) => ({ key: `${s.date}:${s.key}:${text}`, text }));
  });
  if (!lines.length) return null;
  return (
    <Section id="brief-partners" title="Your handover" headingLevel={3}>
      <div className="partners">
        {lines.map((l) => (
          <p key={l.key} className="notice">
            <ArrowsLeftRight size={18} aria-hidden="true" />
            <span>{l.text}</span>
          </p>
        ))}
      </div>
    </Section>
  );
}
