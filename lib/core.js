import fs from 'node:fs';
import { timingSafeEqual } from 'node:crypto';

export const manifest = JSON.parse(fs.readFileSync(new URL('../data/pairs.json', import.meta.url), 'utf8'));
export const pairById = new Map(manifest.pairs.map(pair => [pair.pair_id, pair]));
export const roles = ['rater_a', 'rater_b', 'adjudication'];

export function authenticatedRole(req) {
  const supplied = /^Bearer (.+)$/i.exec(req.headers.authorization || '')?.[1] || '';
  if (!supplied) return null;
  const secrets = [
    ['rater_a', process.env.RATER_A_TOKEN],
    ['rater_b', process.env.RATER_B_TOKEN],
    ['adjudication', process.env.ADJUDICATOR_TOKEN],
    ['export', process.env.EXPORT_TOKEN],
  ];
  for (const [role, secret] of secrets) {
    if (!secret || secret.length < 24) continue;
    const a = Buffer.from(supplied);
    const b = Buffer.from(secret);
    if (a.length === b.length && timingSafeEqual(a, b)) return role;
  }
  return null;
}

export function sendJson(res, status, body) {
  res.setHeader('Cache-Control', 'no-store');
  res.status(status).json(body);
}

export function validSubmission(body) {
  if (!body || !pairById.has(body.pair_id)) return 'Unknown pair ID';
  if (!Number.isInteger(body.grade) || body.grade < 0 || body.grade > 3) return 'Grade must be 0, 1, 2, or 3';
  if (!Number.isInteger(body.expected_version) || body.expected_version < 0) return 'Invalid version';
  if (typeof body.evidence !== 'string' || body.evidence.length > 1000) return 'Evidence must be at most 1000 characters';
  return null;
}

export function csvCell(value) {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function exportCsv(pairs, ratings) {
  const lines = ['pair_id,query_asset,candidate_asset,grade,evidence'];
  for (const pair of pairs) {
    const rating = ratings.get(pair.pair_id);
    lines.push([
      pair.pair_id, `${pair.query_id}.stp`, `${pair.candidate_id}.stp`,
      rating?.grade ?? '', rating?.evidence ?? '',
    ].map(csvCell).join(','));
  }
  return lines.join('\r\n') + '\r\n';
}

export function disagreementIds(a, b) {
  return new Set(manifest.pairs.filter(pair =>
    a.has(pair.pair_id) && b.has(pair.pair_id) &&
    a.get(pair.pair_id).grade !== b.get(pair.pair_id).grade
  ).map(pair => pair.pair_id));
}
