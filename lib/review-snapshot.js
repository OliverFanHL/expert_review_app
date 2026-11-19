import { roles } from './core.js';

export function reviewSnapshot(manifest, rows) {
  const byPair = new Map();
  for (const { pair_id, role, grade, evidence, version, updated_at } of rows) {
    if (!byPair.has(pair_id)) byPair.set(pair_id, {});
    byPair.get(pair_id)[role] = { grade, evidence, version, updated_at };
  }

  const saved_by_role = Object.fromEntries(roles.map(role => [role, 0]));
  const pairs = manifest.pairs.map(pair => {
    const saved = byPair.get(pair.pair_id);
    const reviews = Object.fromEntries(roles.map(role => {
      const rating = saved?.[role] ?? null;
      if (rating) saved_by_role[role]++;
      return [role, rating];
    }));
    return { ...pair, reviews };
  });

  return {
    schema_version: 1,
    source: 'human_reviewer_submissions',
    protocol_hash: manifest.protocol_hash,
    exported_at: new Date().toISOString(),
    rubric: manifest.rubric,
    counts: { pairs: pairs.length, saved_by_role },
    pairs,
  };
}
