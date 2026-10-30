import { ArrowsClockwise, CalendarBlank, CheckCircle, CircleDashed, Clock, PencilSimpleLine, SealCheck, UserCircle, WarningOctagon } from '@phosphor-icons/react';
import { categoryMeta } from '../../utils/categories';
import { dueInfo, formatDateTime, isOverdue, personName, roleLabel, taskPerson } from '../../utils/format';

/** Category: neutral badge with a fixed icon per category (identity is never colour-only). */
export function CategoryBadge({ name, short = false }) {
  const meta = categoryMeta(name);
  const Icon = meta.icon;
  return (
    <span className="badge" title={meta.label}>
      <Icon size={14} aria-hidden="true" />
      {short ? meta.short : meta.label}
    </span>
  );
}

/** A supervisor has checked (and possibly corrected) the model's analysis of this report. */
export function ReviewedBadge({ report }) {
  if (!report?.reviewed_at) return null;
  const who = report.review?.reviewed_by ? ` by ${personName(report.review.reviewed_by)}` : '';
  return (
    <span className="badge badge--ok" title={`Reviewed${who}, ${formatDateTime(report.reviewed_at)}`}>
      <SealCheck size={14} weight="fill" aria-hidden="true" />
      Reviewed
    </span>
  );
}

/** Task status: overdue (critical), pending, resolved. */
export function TaskStatusBadge({ task, now }) {
  if (task.status === 'resolved') {
    return (
      <span className="badge badge--ok">
        <CheckCircle size={14} weight="fill" aria-hidden="true" />
        Resolved
      </span>
    );
  }
  if (isOverdue(task, now)) {
    return (
      <span className="badge badge--critical">
        <WarningOctagon size={14} weight="fill" aria-hidden="true" />
        Overdue
      </span>
    );
  }
  return (
    <span className="badge">
      <Clock size={14} aria-hidden="true" />
      Pending
    </span>
  );
}

/** Who a task belongs to, with role-appropriate wording. */
export function AssigneeBadge({ task, currentUserId, usersById }) {
  const reassign = task.needs_reassignment && task.status === 'pending';
  if (!task.assigned_to && reassign) return <ReassignBadge />;
  if (task.assigned_to && reassign) {
    return (
      <>
        <span className="badge">
          <UserCircle size={14} aria-hidden="true" />
          {personName(taskPerson(task, 'assignee', usersById)) ?? 'A colleague (deactivated)'}
        </span>
        <ReassignBadge />
      </>
    );
  }
  if (!task.assigned_to) {
    return (
      <span className="badge">
        <CircleDashed size={14} aria-hidden="true" />
        Unassigned
      </span>
    );
  }
  if (task.assigned_to === currentUserId) {
    return (
      <span className="badge badge--accent">
        <UserCircle size={14} weight="fill" aria-hidden="true" />
        Assigned to you
      </span>
    );
  }
  const name = personName(taskPerson(task, 'assignee', usersById));
  return (
    <span className="badge">
      <UserCircle size={14} aria-hidden="true" />
      {name ?? 'Assigned to a colleague'}
    </span>
  );
}

/** The assignee was deactivated or deleted; a supervisor should give the task to someone else. */
export function ReassignBadge() {
  return (
    <span className="badge badge--accent">
      <ArrowsClockwise size={14} aria-hidden="true" />
      Needs reassignment
    </span>
  );
}

/** Who wrote the handover behind a report ("by you" for the signed-in user). */
export function SubmitterBadge({ submittedBy, currentUserId, withRole = false }) {
  if (!submittedBy) return null;
  const mine = submittedBy.user_id === currentUserId;
  return (
    <span className="badge" title={`Submitted by ${personName(submittedBy)}, ${roleLabel(submittedBy.role).toLowerCase()}`}>
      <PencilSimpleLine size={14} aria-hidden="true" />
      {mine ? 'By you' : `By ${personName(submittedBy)}`}
      {withRole && !mine ? `, ${roleLabel(submittedBy.role).toLowerCase()}` : ''}
    </span>
  );
}

/** Due time: red only when overdue; "due soon" (within 2h) is emphasised with weight, not red. */
export function DueBadge({ task, now, showNone = false }) {
  const info = dueInfo(task, now);
  if (info.state === 'none') {
    return showNone ? (
      <span className="badge">
        <CalendarBlank size={14} aria-hidden="true" />
        No due time
      </span>
    ) : null;
  }
  if (info.state === 'overdue') {
    return (
      <span className="badge badge--critical">
        <WarningOctagon size={14} weight="fill" aria-hidden="true" />
        {info.text}
      </span>
    );
  }
  return (
    <span className={`badge ${info.state === 'soon' ? 'badge--soon' : ''}`}>
      <CalendarBlank size={14} aria-hidden="true" />
      {info.text}
    </span>
  );
}
