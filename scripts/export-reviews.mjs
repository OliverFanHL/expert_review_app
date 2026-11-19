import { writeFile } from 'node:fs/promises';
import { manifest } from '../lib/core.js';
import { database, reviewRows } from '../lib/db.js';
import { reviewSnapshot } from '../lib/review-snapshot.js';

const outputPath = process.argv[2];
if (!outputPath || !process.env.DATABASE_URL) {
  console.error('Set DATABASE_URL in your environment and run: node scripts/export-reviews.mjs <output.json>');
  process.exit(1);
}

try {
  const rows = await reviewRows(database(), manifest.protocol_hash);
  const snapshot = reviewSnapshot(manifest, rows);
  await writeFile(outputPath, JSON.stringify(snapshot, null, 2) + '\n', { flag: 'wx' });
  console.log(`Wrote ${outputPath} (${JSON.stringify(snapshot.counts.saved_by_role)})`);
} catch (error) {
  console.error(error.code === 'EEXIST'
    ? 'The output already exists. Choose a new filename to preserve the earlier snapshot.'
    : 'Could not export reviewer results. Check the database connection and output path.');
  process.exitCode = 1;
}
