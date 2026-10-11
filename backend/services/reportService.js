const { getAllReports, getReportById } = require('../models/handoverReportModel');
const { getEntitiesByReportId } = require('../models/reportEntityModel');
const { getTaskByReportId } = require('../models/taskRegisterModel');
const { getNotificationByReportId } = require('../models/notificationModel');
const { getSubmissionById } = require('../models/handoverSubmissionModel');

async function listReports({ limit, offset, submittedBy } = {}) {
  return getAllReports({ limit, offset, submittedBy });
}

async function getReportDetail(reportId) {
  const report = await getReportById(reportId);
  if (!report) return null;

  const [entities, task, notification, submission] = await Promise.all([
    getEntitiesByReportId(reportId),
    getTaskByReportId(reportId),
    getNotificationByReportId(reportId),
    getSubmissionById(report.submission_id),
  ]);

  return { ...report, entities, task, notification, submission };
}

module.exports = { listReports, getReportDetail };