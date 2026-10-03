const { createSubmission, updateProcessingStatus } = require('../models/handoverSubmissionModel');
const { createReport } = require('../models/handoverReportModel');
const { createEntities } = require('../models/reportEntityModel');
const { getCategoryByName } = require('../models/incidentCategoryModel');

async function processHandover({ userId, inputType, content, languageVariant, shift }) {
  const submission = await createSubmission({ userId, inputType, content, languageVariant, shift });

  try {
    await updateProcessingStatus(submission.submission_id, 'processing');

    // TEMPORARY STUB — replace with a real call to the Python inference
    // microservice once built
    const fakeInferenceResult = {
      summary: 'Stub summary — inference service not yet connected.',
      incidentCategory: 'Aircraft Equipment Problem',
      categoryConfidence: 0.91,
      entities: [
        { type: 'AIRCRAFT', text: 'B737', confidence: 0.95 },
        { type: 'COMPONENT', text: 'hydraulic pump', confidence: 0.88 },
      ],
    };

    const category = await getCategoryByName(fakeInferenceResult.incidentCategory);

    const report = await createReport({
      submissionId: submission.submission_id,
      summary: fakeInferenceResult.summary,
      categoryId: category ? category.category_id : null,
      categoryConfidence: fakeInferenceResult.categoryConfidence,
    });

    const entities = await createEntities(report.report_id, fakeInferenceResult.entities);

    await updateProcessingStatus(submission.submission_id, 'completed');

    return { submission, report, entities };
  } catch (err) {
    await updateProcessingStatus(submission.submission_id, 'failed');
    throw err;
  }
}

module.exports = { processHandover };