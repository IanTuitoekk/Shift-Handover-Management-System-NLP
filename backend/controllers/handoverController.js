const { processHandover } = require('../services/handoverService');
const { listReports, getReportDetail, reviewReport } = require('../services/reportService');
const realtime = require('../realtime');
const { transcribe } = require('../services/transcriptionService');
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

/**
 * GET /api/handovers. Filters (all optional): submitted_by=me|<user id>, shift=day|night,
 * category=<name>|unclassified, review=true|false, min_confidence, max_confidence (0..1, max
 * exclusive), from, to (ISO times, to exclusive), sort=newest|confidence, limit (max 100), offset.
 */
const getReports = async (req, res) => {
  const q = req.query;
  const bad = (message) => res.status(400).json({ error: message });
  const limit = Math.min(parseInt(q.limit, 10) || 20, 100); // cap at 100
  const offset = Math.max(parseInt(q.offset, 10) || 0, 0);
  // Any signed-in user may filter; every report is already visible.
  const submittedBy = q.submitted_by === 'me' ? req.user.userId : q.submitted_by || null;
  if (submittedBy && !/^[0-9a-f-]{36}$/i.test(submittedBy)) return bad('submitted_by must be "me" or a user id');

  const shift = q.shift ? String(q.shift).toLowerCase() : null;
  if (shift && !SHIFTS.includes(shift)) return bad(`shift must be one of: ${SHIFTS.join(', ')}`);

  const review = q.review === undefined ? null : q.review === 'true' ? true : q.review === 'false' ? false : 'bad';
  if (review === 'bad') return bad('review must be true or false');

  const confidence = (name) => {
    if (q[name] === undefined || q[name] === '') return null;
    const n = Number(q[name]);
    return Number.isFinite(n) && n >= 0 && n <= 1 ? n : NaN;
  };
  const minConfidence = confidence('min_confidence');
  const maxConfidence = confidence('max_confidence');
  if (Number.isNaN(minConfidence) || Number.isNaN(maxConfidence)) return bad('min_confidence and max_confidence must be between 0 and 1');

  const time = (name) => {
    if (!q[name]) return null;
    const d = new Date(q[name]);
    return Number.isNaN(d.getTime()) ? 'bad' : d.toISOString();
  };
  const from = time('from');
  const to = time('to');
  if (from === 'bad' || to === 'bad') return bad('from and to must be ISO date-times');

  const sort = q.sort || 'newest';
  if (!['newest', 'confidence'].includes(sort)) return bad('sort must be newest or confidence');

  try {
    const result = await listReports({
      limit,
      offset,
      sort,
      submittedBy,
      shift,
      category: q.category ? String(q.category) : null,
      review,
      minConfidence,
      maxConfidence,
      from,
      to,
    });
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

// POST /api/handovers/transcribe (multipart: `audio`, optional `language` en|sw). Returns the
// transcript for the crew member to check and edit; nothing is saved until they submit it.
const transcribeHandover = async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Attach the recording as "audio"' });
  try {
    const result = await transcribe({
      buffer: req.file.buffer,
      mimetype: req.file.mimetype,
      filename: req.file.originalname,
      language: req.body.language,
    });
    res.json(result);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: 'Failed to transcribe the recording' });
  }
};

// PUT /api/handovers/:reportId/review (supervisor) { category_name, entities: [{ type, text }] }
const reviewHandover = async (req, res) => {
  try {
    const result = await reviewReport(req.params.reportId, {
      categoryName: req.body.category_name,
      entities: req.body.entities,
      reviewerId: req.user.userId,
    });
    if (!result) return res.status(404).json({ error: 'Report not found' });
    const detail = await getReportDetail(req.params.reportId);
    res.json(detail);
    // Report lists, stats and the task text change for everyone.
    realtime.toAll('report:reviewed', { report_id: req.params.reportId, by: req.user.userId });
    if (result.task) realtime.toAll('task:updated', { task: result.task, by: req.user.userId });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: 'Failed to save the review' });
  }
};

module.exports = { createHandover, getReports, getReport, transcribeHandover, reviewHandover };