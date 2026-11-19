import assert from 'node:assert/strict';
import test from 'node:test';
import handler from '../api/export.js';
import { manifest } from '../lib/core.js';
import { reviewSnapshot } from '../lib/review-snapshot.js';

test('manager JSON keeps partial reviews and distinguishes a zero grade from a missing grade', () => {
  const [first, second] = manifest.pairs;
  const updated_at = '2026-11-19T00:00:00.000Z';
  const snapshot = reviewSnapshot(manifest, [
    { pair_id: second.pair_id, role: 'rater_b', grade: 0, evidence: 'Different use.', version: 2, updated_at },
  ]);

  assert.equal(snapshot.protocol_hash, manifest.protocol_hash);
  assert.equal(snapshot.counts.pairs, manifest.pairs.length);
  assert.deepEqual(snapshot.counts.saved_by_role, { rater_a: 0, rater_b: 1, adjudication: 0 });
  assert.deepEqual(snapshot.pairs[0], { ...first, reviews: { rater_a: null, rater_b: null, adjudication: null } });
  assert.deepEqual(snapshot.pairs[1].reviews.rater_b, { grade: 0, evidence: 'Different use.', version: 2, updated_at });
});

test('a reviewer code cannot download the manager JSON', async t => {
  const previous = process.env.RATER_A_TOKEN;
  t.after(() => {
    if (previous === undefined) delete process.env.RATER_A_TOKEN;
    else process.env.RATER_A_TOKEN = previous;
  });
  process.env.RATER_A_TOKEN = 'test-rater-a-sufficient-length';
  const response = {
    setHeader() {},
    status(code) { assert.equal(code, 403); return this; },
    json(body) { assert.deepEqual(body, { error: 'Manager access required' }); },
  };
  await handler({ method: 'GET', query: { format: 'json' }, headers: {
    authorization: `Bearer ${process.env.RATER_A_TOKEN}`,
  } }, response);
});
