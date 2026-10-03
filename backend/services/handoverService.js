const axios = require('axios');
const { createSubmission, updateProcessingStatus } = require('../models/handoverSubmissionModel');
const { createReport } = require('../models/handoverReportModel');
const { createEntities } = require('../models/reportEntityModel');
const { getCategoryByName } = require('../models/incidentCategoryModel');

const INFERENCE_URL = process.env.INFERENCE_SERVICE_URL;

async function processHandover({ userId, inputType, content, languageVariant, shift }) {
  const submission = await createSubmission({ userId, inputType, content, languageVariant, shift });

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

    await updateProcessingStatus(submission.submission_id, 'completed');

    return { submission, report, entities };
  } catch (err) {
    await updateProcessingStatus(submission.submission_id, 'failed');
    throw err;
  }
}

module.exports = { processHandover };