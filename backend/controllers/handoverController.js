const { processHandover } = require('../services/handoverService');
const { listReports, getReportDetail } = require('../services/reportService');
const realtime = require('../realtime');
const { SHIFTS } = require('../config/shifts');

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

    // Push to everyone signed in. Alerts are broadcast (recipient_id is null), so everyone gets it.
    try {
      const detail = await getReportDetail(result.report.report_id);
      realtime.toAll('handover:created', {
        report: detail,
        task: result.task ? { ...result.task, shift: detail.shift } : null,
        notification: result.notification ? { ...result.notification, is_read: false, read_at: null } : null,
        submittedBy: req.user.userId,
      });
    } catch (pushErr) {
      console.error('Realtime push failed:', pushErr.message);
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to process handover' });
  }
};

const getReports = async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100); // cap at 100
  const offset = parseInt(req.query.offset, 10) || 0;
  // ?submitted_by=me or a user id. Any signed-in user may filter; every report is already visible.
  const submittedByParam = req.query.submitted_by;
  const submittedBy = submittedByParam === 'me' ? req.user.userId : submittedByParam || null;
  if (submittedBy && !/^[0-9a-f-]{36}$/i.test(submittedBy)) {
    return res.status(400).json({ error: 'submitted_by must be "me" or a user id' });
  }

  const shift = req.query.shift ? String(req.query.shift).toLowerCase() : null;
  if (shift && !SHIFTS.includes(shift)) {
    return res.status(400).json({ error: `shift must be one of: ${SHIFTS.join(', ')}` });
  }

  try {
    const result = await listReports({ limit, offset, submittedBy, shift });
    res.json(result);
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