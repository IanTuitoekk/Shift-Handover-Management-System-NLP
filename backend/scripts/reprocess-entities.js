#!/usr/bin/env node
/*
 * Re-runs the inference service on stored handovers and replaces ONLY their entities (aircraft,
 * components, roles, ...). Category, summary, tasks and alerts are left as they are, because
 * people may already have acted on them.
 *
 * Use after a model or decoder fix, e.g. to repair entities cut mid-word ("Hydraulic pump lea").
 *
 *   npm run reprocess-entities              preview: lists what would change, writes nothing
 *   npm run reprocess-entities -- --apply   replaces the changed reports' entities (one transaction each)
 *   ... --report <report_id>                only that report
 *
 * Needs the inference service running (INFERENCE_SERVICE_URL).
 */
require('dotenv').config();
const axios = require('axios');
const pool = require('../config/db');

const apply = process.argv.includes('--apply');
const onlyIndex = process.argv.indexOf('--report');
const onlyReport = onlyIndex > -1 ? process.argv[onlyIndex + 1] : null;

const key = (e) => `${e.type ?? e.entity_type}|${e.text ?? e.entity_text}`;
const show = (list) => (list.length ? list.map((e) => `${e.entity_type ?? e.type}: "${e.entity_text ?? e.text}"`).join(', ') : '(none)');

(async () => {
  const reports = await pool.query(
    `SELECT r.report_id, r.generated_at, s.content
     FROM handover_reports r JOIN handover_submissions s ON s.submission_id = r.submission_id
     WHERE ($1::uuid IS NULL OR r.report_id = $1)
     ORDER BY r.generated_at`,
    [onlyReport]
  );
  console.log(`${apply ? 'APPLYING' : 'PREVIEW (nothing is written; add --apply to save)'}: ${reports.rowCount} report(s)\n`);

  let changed = 0;
  for (const report of reports.rows) {
    const current = (
      await pool.query(`SELECT entity_type, entity_text, confidence FROM report_entities WHERE report_id = $1 ORDER BY id`, [report.report_id])
    ).rows;
    const { data } = await axios.post(`${process.env.INFERENCE_SERVICE_URL}/predict`, { text: report.content });
    const fresh = data.entities;

    const same = current.length === fresh.length && current.every((e, i) => key(e) === key(fresh[i]));
    if (same) continue;
    changed += 1;
    console.log(`Report ${report.report_id} (${report.generated_at.toISOString()})`);
    console.log(`  text:   ${report.content.slice(0, 100)}${report.content.length > 100 ? '…' : ''}`);
    console.log(`  before: ${show(current)}`);
    console.log(`  after:  ${show(fresh)}\n`);

    if (apply) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(`DELETE FROM report_entities WHERE report_id = $1`, [report.report_id]);
        for (const e of fresh) {
          await client.query(
            `INSERT INTO report_entities (report_id, entity_type, entity_text, confidence) VALUES ($1, $2, $3, $4)`,
            [report.report_id, e.type, e.text, e.confidence]
          );
        }
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    }
  }

  console.log(
    changed === 0
      ? 'Every report already matches the current model.'
      : `${changed} report(s) ${apply ? 'updated' : 'would change'}.${apply ? '' : ' Run again with --apply to save.'}`
  );
  await pool.end();
})().catch(async (err) => {
  console.error('Reprocessing failed:', err.response?.data ?? err.message);
  await pool.end();
  process.exit(1);
});
