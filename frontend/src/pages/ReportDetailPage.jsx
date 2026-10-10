import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, WarningOctagon } from '@phosphor-icons/react';
import { api } from '../api/client';
import { useAuth } from '../auth/useAuth';
import { useResource } from '../hooks/useResource';
import { AssignControl } from '../components/AssignControl';
import { ConfidenceBadge } from '../components/ConfidenceBadge';
import { LOW_CONFIDENCE_THRESHOLD } from '../config';
import { formatDateTime, formatPercent, isOverdue, needsReview } from '../utils/format';
import './dashboard.css';
import './report.css';

const ENTITY_LABELS = {
  AIRCRAFT: 'Aircraft',
  COMPONENT: 'Components',
  LOCATION: 'Locations',
  ROLE: 'Roles',
  TASK: 'Tasks mentioned',
  TIME: 'Times',
};

function groupEntities(entities = []) {
  const groups = {};
  for (const entity of entities) {
    (groups[entity.entity_type] ??= []).push(entity);
  }
  return Object.keys(ENTITY_LABELS)
    .filter((type) => groups[type]?.length)
    .map((type) => ({ type, label: ENTITY_LABELS[type], items: groups[type] }));
}

export function ReportDetailPage() {
  const { reportId } = useParams();
  const { user } = useAuth();
  const { data: report, error, loading, reload, mutate } = useResource(`report:${reportId}`, () =>
    api.getReport(reportId),
  );
  const isSupervisor = user?.role === 'supervisor';
  // GET /api/users is supervisor-only, so other roles never request it.
  const users = useResource(isSupervisor ? 'users' : null, api.listUsers);

  async function assignTask(taskId, userId) {
    const updated = await api.assignTask(taskId, userId);
    mutate((current) => (current?.task ? { ...current, task: { ...current.task, ...updated } } : current));
    reload();
  }

  const notFound = error?.response?.status === 404 || error?.response?.status === 400;

  return (
    <>
      <div className="page-band">
        <div className="page-container page-band-inner report-band">
          <Link to="/" className="back-link">
            <ArrowLeft size={16} aria-hidden="true" />
            Back to handover board
          </Link>
          <h1 className="page-title">{report?.category_name ?? (loading ? 'Loading report…' : 'Handover report')}</h1>
          {report && <p className="page-subtitle">Processed {formatDateTime(report.generated_at)}</p>}
        </div>
      </div>

      <div className="page-container dashboard report-page">
        {loading && !report && (
          <div className="panel panel-body stack-skeleton" role="status" aria-label="Loading report…">
            <span className="skeleton" style={{ height: '1.5rem', width: '40%' }} />
            <span className="skeleton" style={{ height: '4rem' }} />
            <span className="skeleton" style={{ height: '6rem' }} />
          </div>
        )}

        {error && !report && (
          <div className="panel empty">
            <strong>{notFound ? 'Report not found' : 'Couldn’t load this report'}</strong>
            <p>
              {notFound
                ? 'It may have been removed, or the link is wrong. Return to the board to find it.'
                : 'Check your connection, then try again.'}
            </p>
            {notFound ? (
              <Link to="/" className="btn btn-secondary btn-sm">
                Back to handover board
              </Link>
            ) : (
              <button type="button" className="btn btn-secondary btn-sm" onClick={reload}>
                Try again
              </button>
            )}
          </div>
        )}

        {report && (
          <ReportBody
            report={report}
            currentUserId={user?.user_id}
            users={isSupervisor ? users : null}
            onAssign={assignTask}
          />
        )}
      </div>
    </>
  );
}

function ReportBody({ report, currentUserId, users, onAssign }) {
  const flagged = needsReview(report);
  const groups = groupEntities(report.entities);
  const task = report.task;

  return (
    <div className="dashboard-grid">
      <div className="dashboard-primary">
        {flagged && (
          <p className="alert alert-critical" role="note">
            <WarningOctagon size={18} weight="fill" aria-hidden="true" />
            The classifier is less than {formatPercent(LOW_CONFIDENCE_THRESHOLD)} sure about this category. Check the
            summary against the original handover before acting on it.
          </p>
        )}

        <section className="panel" aria-labelledby="summary-title">
          <div className="panel-header">
            <h2 id="summary-title" className="panel-title">
              Summary
            </h2>
            <ConfidenceBadge report={report} />
          </div>
          <div className="panel-body">
            <p className="report-detail-summary">{report.summary || 'No summary was generated for this report.'}</p>
          </div>
        </section>

        <section className="panel" aria-labelledby="entities-title">
          <div className="panel-header">
            <h2 id="entities-title" className="panel-title">
              Extracted details
            </h2>
          </div>
          {groups.length === 0 ? (
            <div className="empty">
              <strong>No details extracted</strong>
              <p>The model didn’t find aircraft, components or locations in this handover.</p>
            </div>
          ) : (
            <dl className="entity-groups">
              {groups.map((group) => (
                <div key={group.type} className="entity-group">
                  <dt>{group.label}</dt>
                  <dd>
                    <ul className="entity-list">
                      {group.items.map((entity, index) => (
                        <li key={`${entity.entity_text}-${index}`} className="badge" translate={group.type === 'AIRCRAFT' ? 'no' : undefined}>
                          {entity.entity_text}
                        </li>
                      ))}
                    </ul>
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </section>
      </div>

      <div className="dashboard-secondary">
        <section className="panel" aria-labelledby="task-title">
          <div className="panel-header">
            <h2 id="task-title" className="panel-title">
              Task
            </h2>
            {task && (
              <span
                className={`badge ${task.status === 'resolved' ? 'badge-success' : isOverdue(task) ? 'badge-critical' : ''}`}
              >
                {task.status === 'resolved' ? 'Resolved' : isOverdue(task) ? 'Overdue' : 'Pending'}
              </span>
            )}
          </div>
          <div className="panel-body report-side">
            {task ? (
              <>
                <p>{task.description}</p>
                <p className="field-hint">
                  Raised {formatDateTime(task.created_at)}
                  {task.resolved_at && `. Resolved ${formatDateTime(task.resolved_at)}`}
                </p>
                {users && task.status !== 'resolved' && (
                  <AssignControl task={task} users={users} currentUserId={currentUserId} onAssign={onAssign} />
                )}
              </>
            ) : (
              <p className="field-hint">No task was raised for this report.</p>
            )}
          </div>
        </section>

        {report.notification && (
          <section className="panel" aria-labelledby="alert-title">
            <div className="panel-header">
              <h2 id="alert-title" className="panel-title">
                Alert sent
              </h2>
            </div>
            <div className="panel-body report-side">
              <p>{report.notification.message}</p>
              <p className="field-hint">Sent {formatDateTime(report.notification.sent_at)}</p>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
