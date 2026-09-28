import { authenticatedRole, manifest, pairById, sendJson, validSubmission } from '../lib/core.js';
import { database, independentCounts, ratingsFor } from '../lib/db.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'POST required' });
  const role = authenticatedRole(req);
  if (!role || role === 'export') return sendJson(res, 401, { error: 'Invalid rater access code' });
  let body;
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; }
  catch { return sendJson(res, 400, { error: 'Invalid JSON' }); }
  const invalid = validSubmission(body);
  if (invalid) return sendJson(res, 400, { error: invalid });
  const { pair_id, grade, evidence, expected_version } = body;
  if (!pairById.has(pair_id)) return sendJson(res, 400, { error: 'Unknown pair ID' });
  try {
    const sql = database();
    const hash = manifest.protocol_hash;
    const counts = await independentCounts(sql, hash);
    const independentComplete = counts.rater_a === manifest.pairs.length &&
      counts.rater_b === manifest.pairs.length;
    if (role !== 'adjudication' && independentComplete) {
      const savedRows = await sql`
        SELECT pair_id, grade, evidence, version, updated_at
        FROM expert_annotations
        WHERE protocol_hash = ${hash} AND role = ${role} AND pair_id = ${pair_id}
      `;
      const saved = savedRows[0];
      if (saved?.grade === grade && saved?.evidence === evidence) {
        return sendJson(res, 200, { saved, already_saved: true });
      }
      return sendJson(res, 409, { error: 'Independent ratings are closed because both experts have completed the protocol.' });
    }
    if (role === 'adjudication') {
      if (!independentComplete) {
        return sendJson(res, 409, { error: 'Adjudication opens when both independent experts finish.' });
      }
      const prior = await sql`
        SELECT role, grade FROM expert_annotations
        WHERE protocol_hash = ${hash} AND pair_id = ${pair_id}
          AND role IN ('rater_a', 'rater_b')
      `;
      if (prior.length !== 2 || prior[0].grade === prior[1].grade) {
        return sendJson(res, 409, { error: 'Only pairs with two differing expert grades may be adjudicated' });
      }
    }
    const rows = await sql`
      INSERT INTO expert_annotations (protocol_hash, role, pair_id, grade, evidence, version)
      VALUES (${hash}, ${role}, ${pair_id}, ${grade}, ${evidence}, 1)
      ON CONFLICT (protocol_hash, role, pair_id) DO UPDATE
      SET grade = EXCLUDED.grade, evidence = EXCLUDED.evidence,
          version = expert_annotations.version + 1, updated_at = now()
      WHERE expert_annotations.version = ${expected_version}
      RETURNING pair_id, grade, evidence, version, updated_at
    `;
    if (rows.length) return sendJson(res, 200, { saved: rows[0] });
    const current = (await ratingsFor(sql, hash, role)).get(pair_id);
    if (current?.grade === grade && current?.evidence === evidence) {
      return sendJson(res, 200, { saved: current, already_saved: true });
    }
    return sendJson(res, 409, { error: 'This pair changed in another session. Reload before editing.', current });
  } catch (error) {
    console.error('Grade save failed', error);
    return sendJson(res, 503, { error: 'Save failed. Your selection remains on screen; retry before continuing.' });
  }
}
