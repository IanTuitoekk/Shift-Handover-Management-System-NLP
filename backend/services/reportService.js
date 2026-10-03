const { getAllReports, getReportById } = require('../models/handoverReportModel');
const { getEntitiesByReportId } = require('../models/reportEntityModel');
const { getTaskByReportId } = require('../models/taskRegisterModel');
const { getNotificationByReportId } = require('../models/notificationModel');

async function listReports() {
  return getAllReports();
}

async function getReportDetail(reportId) {
  const report = await getReportById(reportId);
  if (!report) return null;

  const [entities, task, notification] = await Promise.all([
    getEntitiesByReportId(reportId),
    getTaskByReportId(reportId),
    getNotificationByReportId(reportId),
  ]);

  return { ...report, entities, task, notification };
}

module.exports = { listReports, getReportDetail };