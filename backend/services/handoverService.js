const axios = require('axios');
const { createSubmission, updateProcessingStatus } = require('../models/handoverSubmissionModel');
const { createReport } = require('../models/handoverReportModel');
const { createEntities } = require('../models/reportEntityModel');
const { getCategoryByName } = require('../models/incidentCategoryModel');
const { createTask, getTaskByReportId } = require('../models/taskRegisterModel');
const { chooseAssignee } = require('./assignmentService');
const { createNotification } = require('../models/notificationModel');
const { detectLanguage } = require('../utils/languageDetect');

const INFERENCE_URL = process.env.INFERENCE_SERVICE_URL;

// `shift` is the shift being handed over ({ shift_id, name }), or null when no shift covers now.
async function processHandover({ userId, inputType, content, languageVariant, shift }) {
  // Crews no longer pick a language; detect it for analysis unless a client still sends one.
  const language = languageVariant || detectLanguage(content);
  const submission = await createSubmission({ userId, inputType, content, languageVariant: language, shift });

  try {
    await updateProcessingStatus(submission.submission_id, 'processing');

    const { data: inferenceResult } = await axios.post(`${INFERENCE_URL}/predict`, {
      text: content,
    });

    const category = await getCategoryByName(inferenceResult.incident_category);

    const report = await createReport({
      submissionId: submission.submission_id,
      summary: inferenceResult.summary,
      categoryId: category ? category.category_id : null,
      categoryConfidence: inferenceResult.category_confidence,
    });

    const entities = await createEntities(
      report.report_id,
      inferenceResult.entities.map((e) => ({
        type: e.type,
        text: e.text,
        confidence: e.confidence,
      }))
    );

    // The task goes straight to the incoming shift: whoever takes over from the writer in the
    // supervisor's shift plan, else the least busy person on it (see assignmentService). Supervisors
    // can reassign it.
    const assignment = await chooseAssignee({ writerId: userId, shiftId: shift?.shift_id ?? null });
    await createTask({
      reportId: report.report_id,
      assignedTo: assignment.userId,
      assignedByRule: assignment.rule,
      description: `New ${inferenceResult.incident_category} incident reported: ${
        inferenceResult.summary || content.slice(0, 200)
      }`,
    });

    const task = await getTaskByReportId(report.report_id); // with the assignee's name

    const notification = await createNotification({
      reportId: report.report_id,
      recipientId: null,
      message: `New handover report: ${inferenceResult.incident_category} - ${
        inferenceResult.summary || content.slice(0, 200)
      }`,
    });

    await updateProcessingStatus(submission.submission_id, 'completed');

    return { submission, report, entities, task, notification, assignment: { rule: assignment.rule, shift: assignment.shift } };
  } catch (err) {
    await updateProcessingStatus(submission.submission_id, 'failed');
    throw err;
  }
}

module.exports = { processHandover };