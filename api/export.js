import { authenticatedRole, disagreementIds, exportCsv, manifest, roles, sendJson } from '../lib/core.js';
import { database, ratingsFor } from '../lib/db.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'GET required' });
  const requester = authenticatedRole(req);
  const role = req.query.role;
  if (!requester || !roles.includes(role) || (requester !== role && requester !== 'export')) {
    return sendJson(res, 403, { error: 'Not authorized for this export' });
  }
  try {
    const sql = database();
    const hash = manifest.protocol_hash;
    const ratings = await ratingsFor(sql, hash, role);
    if (role !== 'adjudication' && ratings.size !== manifest.pairs.length) {
      return sendJson(res, 409, { error: `${manifest.pairs.length - ratings.size} pairs remain unrated` });
    }
    let exportRatings = ratings;
    if (role === 'adjudication') {
      const a = await ratingsFor(sql, hash, 'rater_a');
      const b = await ratingsFor(sql, hash, 'rater_b');
      if (a.size !== manifest.pairs.length || b.size !== manifest.pairs.length) {
        return sendJson(res, 409, { error: 'Both independent rating files must be complete first' });
      }
      const disagreements = disagreementIds(a, b);
      const unjudged = [...disagreements].filter(id => !ratings.has(id));
      if (unjudged.length) return sendJson(res, 409, { error: `${unjudged.length} disagreements remain` });
      exportRatings = new Map([...ratings].filter(([id]) => disagreements.has(id)));
    }
    const csv = exportCsv(manifest.pairs, exportRatings);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${role}.csv"`);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).send(csv);
  } catch (error) {
    console.error('Export failed', error);
    return sendJson(res, 503, { error: 'Export unavailable. Saved grades have not changed.' });
  }
}
