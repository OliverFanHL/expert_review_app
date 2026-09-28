import { authenticatedRole, disagreementIds, manifest, sendJson } from '../lib/core.js';
import { database, independentCounts, ratingsFor } from '../lib/db.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'GET required' });
  const role = authenticatedRole(req);
  if (!role) return sendJson(res, 401, { error: 'Invalid access code' });
  try {
    const sql = database();
    const hash = manifest.protocol_hash;
    const counts = await independentCounts(sql, hash);
    const independentComplete = counts.rater_a === manifest.pairs.length &&
      counts.rater_b === manifest.pairs.length;
    if (role === 'export') {
      const a = await ratingsFor(sql, hash, 'rater_a');
      const b = await ratingsFor(sql, hash, 'rater_b');
      const adjud = await ratingsFor(sql, hash, 'adjudication');
      const disagreements = disagreementIds(a, b);
      return sendJson(res, 200, { role, total: manifest.pairs.length,
        completed_a: a.size, completed_b: b.size,
        disagreements: disagreements.size,
        adjudicated: [...disagreements].filter(id => adjud.has(id)).length });
    }
    const own = await ratingsFor(sql, hash, role);
    let pairs = manifest.pairs;
    let comparison = {};
    if (role === 'adjudication') {
      if (independentComplete) {
        const a = await ratingsFor(sql, hash, 'rater_a');
        const b = await ratingsFor(sql, hash, 'rater_b');
        const disagreements = disagreementIds(a, b);
        pairs = pairs.filter(pair => disagreements.has(pair.pair_id));
        comparison = Object.fromEntries(pairs.map(pair => [pair.pair_id,
          [a.get(pair.pair_id).grade, b.get(pair.pair_id).grade]]));
      } else {
        pairs = [];
      }
    }
    return sendJson(res, 200, { role, protocol_hash: hash, rubric: manifest.rubric,
      pairs, ratings: Object.fromEntries(own), comparison,
      locked: role !== 'adjudication' && independentComplete,
      independent_complete: independentComplete,
      complete: pairs.filter(pair => own.has(pair.pair_id)).length });
  } catch (error) {
    console.error('Session load failed', error);
    return sendJson(res, 503, { error: 'Annotation storage is unavailable. No progress was changed.' });
  }
}
