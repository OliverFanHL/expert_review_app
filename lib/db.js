import { neon } from '@neondatabase/serverless';

export function database() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not configured');
  return neon(process.env.DATABASE_URL);
}

export async function ratingsFor(sql, hash, role) {
  const rows = await sql`
    SELECT pair_id, grade, evidence, version, updated_at
    FROM expert_annotations
    WHERE protocol_hash = ${hash} AND role = ${role}
  `;
  return new Map(rows.map(row => [row.pair_id, row]));
}

export async function independentCounts(sql, hash) {
  const rows = await sql`
    SELECT role, COUNT(*)::integer AS count
    FROM expert_annotations
    WHERE protocol_hash = ${hash} AND role IN ('rater_a', 'rater_b')
    GROUP BY role
  `;
  return Object.fromEntries(rows.map(row => [row.role, Number(row.count)]));
}
