import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Bell, CheckCircle, WarningOctagon } from '@phosphor-icons/react';
import { api } from '../api/client';
import { useShell } from '../components/shell/ShellContext';
import { useResource } from '../hooks/useResource';
import { Section, ErrorState } from '../components/ui/Layout';
import { AssigneeBadge, CategoryBadge, DueBadge, SubmitterBadge, TaskStatusBadge } from '../components/ui/Badges';
import { DueControl } from '../components/tasks/DueControl';
import { ConfidenceMeter } from '../components/ui/ConfidenceMeter';
import { EntityGroups } from '../components/report/EntityGroups';
import { AssignControl } from '../components/tasks/AssignControl';
import { ResolveButton } from '../components/tasks/ResolveButton';
import { LOW_CONFIDENCE_THRESHOLD } from '../config';
import { formatDateTime, formatPercent, needsReview, parseConfidence, taskSummary } from '../utils/format';
import { leastLoaded } from '../utils/insights';
import { categoryPhoto } from '../assets/photos';

export function ReportDetailPage() {
  const { reportId } = useParams();
  const navigate = useNavigate();
  const shell = useShell();
  const { me, supervisor, now, notifications, markRead, users, usersById, tasks, applyTaskUpdate, assignTask } = shell;
  const { data: report, error, loading, reload, mutate } = useResource(`report:${reportId}`, () => api.getReport(reportId));
  const notFound = error?.response?.status === 404 || error?.response?.status === 400;

  const task = report?.task;
  const alert = (notifications.data ?? []).find((n) => n.report_id === reportId);
  const low = report ? needsReview(report) : false;
  const confidence = report ? parseConfidence(report) : null;
  const suggestion = users?.data ? leastLoaded(users.data, tasks.data ?? []) : null;
  const photo = report ? categoryPhoto(report.category_name) : null;

  async function resolve() {
    const updated = await api.resolveTask(task.task_id);
    mutate((r) => (r ? { ...r, task: { ...r.task, ...updated } } : r));
    applyTaskUpdate(task, updated);
  }

  async function setDue(taskId, dueAt) {
    const updated = await api.setTaskDue(taskId, dueAt);
    mutate((r) => (r ? { ...r, task: { ...r.task, ...updated } } : r));
    applyTaskUpdate(task, updated);
  }

  async function assign(taskId, userId) {
    const updated = await assignTask(taskId, userId);
    mutate((r) => (r ? { ...r, task: { ...r.task, ...updated } } : r));
  }

  return (
    <>
      <div className="detail-head">
        <button type="button" className="btn btn-ghost back" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/reports'))}>
          <ArrowLeft size={16} aria-hidden="true" />
          Back
        </button>
        {report ? (
          <div className="detail-head__grid">
            <div className="detail-head__text">
              <div className="detail-head__row">
                <CategoryBadge name={report.category_name} />
                <ConfidenceMeter report={report} size="lg" />
              </div>
              <h1 className="page-title detail-head__title">{report.summary || 'Handover report'}</h1>
              <p className="page-sub">
                Processed <span className="num">{formatDateTime(report.generated_at)}</span>
                {report.submitted_by && (
                  <>
                    {' '}
                    <SubmitterBadge submittedBy={report.submitted_by} currentUserId={me.user_id} withRole />
                  </>
                )}
              </p>
            </div>
            {photo && (
              <figure className="category-photo">
                <img src={photo.src} width={photo.width} height={photo.height} alt="" loading="lazy" decoding="async" />
              </figure>
            )}
          </div>
        ) : loading ? (
          <div className="stack" aria-label="Loading report…" role="status">
            <span className="skeleton" style={{ width: 240, height: 24 }} />
            <span className="skeleton" style={{ width: '60%', height: 32 }} />
          </div>
        ) : null}
      </div>

      {error && !report && (
        notFound ? (
          <div className="not-available">
            <h1 className="page-title">Report not found</h1>
            <p className="page-sub">It may have been removed, or the link is wrong.</p>
            <Link to="/reports" className="btn btn-primary">
              Go to reports
            </Link>
          </div>
        ) : (
          <ErrorState message="Couldn’t load this report." onRetry={reload} />
        )
      )}

      {report && (
        <div className="split">
          <div className="stack">
            {low && (
              <p className="notice notice--critical">
                <WarningOctagon size={18} weight="fill" aria-hidden="true" />
                <span>
                  The classifier is {confidence === null ? 'unsure' : `only ${formatPercent(confidence)} confident`} about
                  this category (below {formatPercent(LOW_CONFIDENCE_THRESHOLD)}). Compare the summary and details with the
                  original handover below{supervisor ? ' before assigning work from it' : ''}.
                </span>
              </p>
            )}
            {report.submission && <OriginalHandover submission={report.submission} />}
            <Section id="details" title="Extracted details" variant="raised">
              <EntityGroups entities={report.entities} ruled />
            </Section>
          </div>

          <aside className="stack">
            <Section id="task" title="Task" variant="raised" action={task && <TaskStatusBadge task={task} now={now.getTime()} />}>
              {task ? (
                <div className="detail-block">
                  <p>{taskSummary(task)}</p>
                  <div className="detail-block__meta">
                    <AssigneeBadge task={task} currentUserId={me.user_id} usersById={usersById} />
                    {task.status === 'pending' && <DueBadge task={task} now={now} showNone />}
                    <span className="field-hint">
                      Raised <span className="num">{formatDateTime(task.created_at)}</span>
                    </span>
                    {task.resolved_at && (
                      <span className="field-hint">
                        <CheckCircle size={14} aria-hidden="true" /> Resolved <span className="num">{formatDateTime(task.resolved_at)}</span>
                        {task.resolved_by === me.user_id ? ' by you' : usersById.get(task.resolved_by) ? ` by ${usersById.get(task.resolved_by).full_name}` : ''}
                      </span>
                    )}
                  </div>
                  {task.status === 'pending' && (
                    <div className="detail-block__actions">
                      {supervisor && <AssignControl task={task} users={users} currentUserId={me.user_id} suggestion={suggestion} onAssign={assign} />}
                      {supervisor && <DueControl task={task} now={now} onSave={setDue} />}
                      <ResolveButton onResolve={resolve} />
                    </div>
                  )}
                </div>
              ) : (
                <p className="field-hint">No task was raised for this report.</p>
              )}
            </Section>

            {report.notification && (
              <Section
                id="alert"
                title="Alert"
                variant="raised"
                action={
                  alert &&
                  (alert.is_read ? (
                    <span className="badge">Read</span>
                  ) : (
                    <span className="badge badge--accent">
                      <Bell size={14} aria-hidden="true" /> Unread
                    </span>
                  ))
                }
              >
                <div className="detail-block">
                  <p>{report.notification.message}</p>
                  <span className="field-hint">
                    Sent <span className="num">{formatDateTime(report.notification.sent_at)}</span>
                  </span>
                  {alert && !alert.is_read && (
                    <div className="detail-block__actions">
                      <button type="button" className="btn btn-secondary" onClick={() => markRead([alert.notif_id])}>
                        Mark as read
                      </button>
                    </div>
                  )}
                </div>
              </Section>
            )}
          </aside>
        </div>
      )}
    </>
  );
}

const LANGUAGE_LABELS = { en: 'English', sw: 'Swahili', mixed: 'English and Swahili' };

/** The handover exactly as the crew member wrote it, so the model's summary can be checked. */
function OriginalHandover({ submission }) {
  const language = LANGUAGE_LABELS[submission.language_variant] ?? submission.language_variant;
  return (
    <Section id="original" title="Original handover" variant="raised">
      <blockquote className="original">{submission.content}</blockquote>
      <p className="original__meta">
        {submission.shift && <span>{submission.shift} shift</span>}
        {language && <span>{language}</span>}
        <span>
          Submitted <span className="num">{formatDateTime(submission.submitted_at)}</span>
        </span>
      </p>
    </Section>
  );
}
