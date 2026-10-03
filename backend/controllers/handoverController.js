const { processHandover } = require('../services/handoverService');
const { listReports, getReportDetail } = require('../services/reportService');

const createHandover = async (req, res) => {
  const { narrative_text, input_type, language_variant, shift } = req.body;

  if (!narrative_text) {
    return res.status(400).json({ error: 'narrative_text is required' });
  }

  try {
    const result = await processHandover({
      userId: req.user.userId,
      inputType: input_type || 'text',
      content: narrative_text,
      languageVariant: language_variant || null,
      shift: shift || null,
    });

    res.status(201).json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to process handover' });
  }
};

const getReports = async (req, res) => {
  try {
    const reports = await listReports();
    res.json(reports);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch reports' });
  }
};

const getReport = async (req, res) => {
  const { reportId } = req.params;
  try {
    const report = await getReportDetail(reportId);
    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }
    res.json(report);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch report' });
  }
};

module.exports = { createHandover, getReports, getReport };