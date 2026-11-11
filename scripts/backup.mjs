// Saves the whole shared database (every trip, member, profile and change) to one file.
//
//   SUPABASE_SECRET_KEY=… npm run backup                 → backups/planner-YYYY-MM-DD.json.gz
//   SUPABASE_SECRET_KEY=… BACKUP_PASSPHRASE=… npm run backup   → …json.gz.enc (encrypted)
//   options: --out <folder>   --no-history (leave out the `changes` table)
//
// The secret key reads past the access rules: keep it in a GitHub secret or a local *.local file,
// never in the repository. See docs/16-backups.md.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { connection, friendlyErrors, FORMAT, pack, readTable, TABLES } from './backup-lib.mjs';

friendlyErrors();

const args = process.argv.slice(2);
const out = args.includes('--out') ? args[args.indexOf('--out') + 1] : 'backups';
const withHistory = !args.includes('--no-history');
const passphrase = process.env.BACKUP_PASSPHRASE || '';

const db = connection();
const tables = {};
for (const { name, key } of TABLES) {
  if (name === 'changes' && !withHistory) continue;
  const rows = await readTable(db, name, key.split(',')[0]);
  if (rows === null) {
    console.log(`${name}: not in this database, skipped`);
    continue;
  }
  tables[name] = rows;
  console.log(`${name}: ${rows.length} rows`);
}

const at = new Date().toISOString();
const bytes = pack({ format: FORMAT, version: 1, at, source: db.url, tables }, passphrase);
mkdirSync(out, { recursive: true });
const file = join(out, `planner-${at.slice(0, 10)}.json.gz${passphrase ? '.enc' : ''}`);
writeFileSync(file, bytes);
console.log(`Saved ${file} (${(bytes.length / 1024 / 1024).toFixed(1)} MB${passphrase ? ', encrypted' : ''})`);
