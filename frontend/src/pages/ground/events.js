/**
 * Personal shift events for the rail and timeline: handovers submitted from this device
 * (the API does not record submitters) and tasks this user resolved.
 */
export function myShiftEvents({ submissions, tasks, me }) {
  const submitted = submissions.map((s) => ({
    kind: 'submitted',
    at: s.at,
    label: s.category ? s.category : 'Handover',
    reportId: s.reportId,
  }));
  const resolved = tasks
    .filter((t) => t.status === 'resolved' && t.resolved_by === me.user_id && t.resolved_at)
    .map((t) => ({ kind: 'resolved', at: t.resolved_at, label: 'Task resolved', reportId: t.report_id, task: t }));
  return [...submitted, ...resolved].sort((a, b) => new Date(b.at) - new Date(a.at));
}
