#!/usr/bin/env node
// Exports supervisor-reviewed reports as training data for the model, one JSON record per line,
// in the same shape as machine-learning/data/processed/train.jsonl (narrative_text,
// incident_category(_grouped), entities [{type, text}], summary, language_variant), plus what the
// model originally said, so the corrections can be studied or added to training.
//
//   npm run export-reviews
//   npm run export-reviews -- --out path/to/file.jsonl --since 2026-10-01
//
// Default output: ../machine-learning/data/corrections/reviewed_handovers.jsonl (ignored by git:
// it contains real handover text).
require('dotenv').config({ quiet: true });
const fs = require('fs');
const path = require('path');
const pool = require('../config/db');
const { listReviewed } = require('../models/reportReviewModel');

const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : null;
};
const out = path.resolve(arg('--out') || path.join(__dirname, '..', '..', 'machine-learning', 'data', 'corrections', 'reviewed_handovers.jsonl'));
const since = arg('--since');

// The backend detects 'en' / 'sw' / 'mixed'; the training data names them like this.
const LANGUAGE = { en: 'English', sw: 'Swahili', mixed: 'code-switched', English: 'English', Swahili: 'Swahili' };

function toRecord(row) {
  return {
    narrative_text: row.narrative_text,
    summary: row.summary,
    incident_category: row.category_name,
    incident_category_grouped: row.category_name,
    entities: row.entities,
    language_variant: LANGUAGE[row.language_variant] ?? row.language_variant ?? null,
    source: 'supervisor-review',
    report_id: row.report_id,
    reviewed_at: row.reviewed_at,
    model_output: {
      incident_category: row.model_category_name,
      category_confidence: row.model_category_confidence === null ? null : Number(row.model_category_confidence),
      entities: (row.model_entities || []).map((e) => ({ type: e.type, text: e.text })),
    },
  };
}

async function main() {
  const rows = await listReviewed({ since });
  const records = rows.map(toRecord);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, records.map((r) => JSON.stringify(r)).join('\n') + (records.length ? '\n' : ''));
  const changed = records.filter(
    (r) =>
      r.incident_category !== r.model_output.incident_category ||
      JSON.stringify(r.entities) !== JSON.stringify(r.model_output.entities)
  ).length;
  console.log(`Exported ${records.length} reviewed report(s) (${changed} corrected, ${records.length - changed} confirmed unchanged) to ${out}`);
  await pool.end();
}

// Only export when run as a command, not when a test imports toRecord.
if (require.main === module) {
  main().catch(async (err) => {
    console.error('Export failed:', err.message);
    await pool.end();
    process.exit(1);
  });
}

module.exports = { toRecord };
