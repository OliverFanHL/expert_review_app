import fs from 'node:fs';
import { neon } from '@neondatabase/serverless';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
const sql = neon(process.env.DATABASE_URL);
const statements = fs.readFileSync(new URL('../schema.sql', import.meta.url), 'utf8')
  .split(';').map(s => s.trim()).filter(Boolean);
for (const statement of statements) await sql.query(statement);
console.log('Expert annotation schema is ready.');
