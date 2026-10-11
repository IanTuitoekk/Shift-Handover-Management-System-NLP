/**
 * Personal shift events for the rail and timeline: handovers this user submitted
 * (GET /api/handovers?submitted_by=me) and tasks this user resolved.
 */
export function myShiftEvents({ myReports = [], tasks, me }) {
  const submitted = myReports.map((r) => ({
    kind: 'submitted',
    at: r.generated_at,
    label: r.category_name || 'Handover',
    reportId: r.report_id,
  }));
  const resolved = tasks
    .filter((t) => t.status === 'resolved' && t.resolved_by === me.user_id && t.resolved_at)
    .map((t) => ({ kind: 'resolved', at: t.resolved_at, label: 'Task resolved', reportId: t.report_id, task: t }));
  return [...submitted, ...resolved].sort((a, b) => new Date(b.at) - new Date(a.at));
}
