import test from 'node:test';
import assert from 'node:assert/strict';
import { authenticatedRole, disagreementIds, exportCsv, manifest, validSubmission } from '../lib/core.js';

test('frozen blinded manifest matches the study selection', () => {
  assert.equal(manifest.pairs.length, 6645);
  assert.equal(manifest.asset_ids.length, 2643);
  assert.equal(new Set(manifest.pairs.map(p => p.pair_id)).size, 6645);
  for (const pair of manifest.pairs) {
    assert.deepEqual(Object.keys(pair), ['pair_id', 'split', 'query_id', 'candidate_id']);
    assert.match(pair.pair_id, /^[a-f0-9]{24}$/);
  }
});

test('submission checks pair, grade, version and evidence length', () => {
  const pair_id = manifest.pairs[0].pair_id;
  assert.equal(validSubmission({ pair_id, grade: 2, evidence: 'Same bore.', expected_version: 0 }), null);
  assert.match(validSubmission({ pair_id, grade: 4, evidence: '', expected_version: 0 }), /Grade/);
  assert.match(validSubmission({ pair_id, grade: 1, evidence: '', expected_version: -1 }), /version/);
  assert.match(validSubmission({ pair_id: 'unknown', grade: 1, evidence: '', expected_version: 0 }), /pair/);
});

test('role token is server-side and exact', () => {
  process.env.RATER_A_TOKEN = '123456789012345678901234567890';
  assert.equal(authenticatedRole({ headers: { authorization: `Bearer ${process.env.RATER_A_TOKEN}` } }), 'rater_a');
  assert.equal(authenticatedRole({ headers: { authorization: 'Bearer 123456789012345678901234567891' } }), null);
  delete process.env.RATER_A_TOKEN;
});

test('CSV keeps frozen order and the study finalizer columns', () => {
  const pair = manifest.pairs[0];
  const csv = exportCsv([pair], new Map([[pair.pair_id, { grade: 2, evidence: 'Bore, flange' }]]));
  assert.equal(csv.split('\r\n')[0], 'pair_id,query_asset,candidate_asset,grade,evidence');
  assert.equal(csv.split('\r\n')[1], `${pair.pair_id},${pair.query_id}.stp,${pair.candidate_id}.stp,2,"Bore, flange"`);
});

test('adjudication includes only independently rated disagreements', () => {
  const [first, second] = manifest.pairs;
  const a = new Map([[first.pair_id, { grade: 1 }], [second.pair_id, { grade: 2 }]]);
  const b = new Map([[first.pair_id, { grade: 3 }], [second.pair_id, { grade: 2 }]]);
  assert.deepEqual([...disagreementIds(a, b)], [first.pair_id]);
});
