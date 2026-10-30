const { getAllReports, getReportById } = require('../models/handoverReportModel');
const { getEntitiesByReportId } = require('../models/reportEntityModel');
const { getTaskByReportId } = require('../models/taskRegisterModel');
const { getNotificationByReportId } = require('../models/notificationModel');
const { getSubmissionById } = require('../models/handoverSubmissionModel');
const { getCategoryByName } = require('../models/incidentCategoryModel');
const { saveReview, getReview } = require('../models/reportReviewModel');

const ENTITY_TYPES = ['AIRCRAFT', 'COMPONENT', 'ROLE', 'LOCATION', 'TASK', 'TIME'];
const fail = (message) => Object.assign(new Error(message), { status: 400 });

async function listReports(options = {}) {
  return getAllReports(options);
}

async function getReportDetail(reportId) {
  const report = await getReportById(reportId);
  if (!report) return null;

  const [entities, task, notification, submission, review] = await Promise.all([
    getEntitiesByReportId(reportId),
    getTaskByReportId(reportId),
    getNotificationByReportId(reportId),
    getSubmissionById(report.submission_id),
    getReview(reportId),
  ]);

  return { ...report, entities, task, notification, submission, review };
}

/**
 * A supervisor's review: the correct category and the full list of entities ({ type, text }).
 * Each entity's text must appear in the original handover, so reviewed reports can become training
 * data (training needs each entity's position in the text). Exact duplicates are dropped.
 * Returns { categoryChanged, task } or null if the report doesn't exist.
 */
async function reviewReport(reportId, { categoryName, entities, reviewerId }) {
  const report = await getReportById(reportId);
  if (!report) return null;
  const category = await getCategoryByName(categoryName);
  if (!category) throw fail(`Unknown category: ${categoryName}`);

  const submission = await getSubmissionById(report.submission_id);
  const text = (submission?.content ?? '').toLowerCase();
  const seen = new Set();
  const clean = [];
  for (const e of entities) {
    const type = String(e.type || '').toUpperCase();
    const value = String(e.text || '').trim().replace(/\s+/g, ' ');
    if (!ENTITY_TYPES.includes(type)) throw fail(`Unknown entity type: ${e.type}`);
    if (!value) throw fail('An entity has no text');
    if (!text.includes(value.toLowerCase())) throw fail(`“${value}” doesn't appear in the handover text`);
    const key = `${type}|${value.toLowerCase()}`;
    if (!seen.has(key)) {
      seen.add(key);
      clean.push({ type, text: value });
    }
  }
  return saveReview(reportId, { categoryId: category.category_id, entities: clean, reviewerId });
}

module.exports = { listReports, getReportDetail, reviewReport, ENTITY_TYPES };