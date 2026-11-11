// Puts a database backup (from scripts/backup.mjs) back into Supabase. Shows what it would do
// unless --yes is given. Everyone's planner picks the restored trip up at its next sync.
//
//   SUPABASE_SECRET_KEY=… npm run restore -- backups/planner-2027-04-01.json.gz            (summary)
//   SUPABASE_SECRET_KEY=… npm run restore -- <file> --trip <trip id> --yes                 (one trip)
//   options:
//     --trip <id>        only this trip (its members, items and history)
//     --exact            also delete items created after the backup (in the restored trips)
//     --with-history     also put back the `changes` table (its times become the restore time)
//     --with-profiles    also put back names and colours (only for accounts that still exist)
//     --extract <file>   just write the backup as plain JSON (decrypted) and stop
//   BACKUP_PASSPHRASE=… for an encrypted backup (.enc).

import { readFileSync, writeFileSync } from 'node:fs';
import { connection, friendlyErrors, readTable, unpack, upsert } from './backup-lib.mjs';

friendlyErrors();

const args = process.argv.slice(2);
const opt = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const file = args.find((a, i) => !a.startsWith('--') && !['--trip', '--extract'].includes(args[i - 1]));
if (!file) {
  console.error('Usage: npm run restore -- <backup file> [--trip <id>] [--exact] [--with-history] [--with-profiles] [--yes]');
  process.exit(1);
}

const backup = unpack(readFileSync(file), process.env.BACKUP_PASSPHRASE || '');
const extract = opt('--extract');
if (extract) {
  writeFileSync(extract, JSON.stringify(backup, null, 1));
  console.log(`Wrote ${extract}`);
  process.exit(0);
}

const trip = opt('--trip');
const write = args.includes('--yes');
const inTrip = (row) => !trip || row.trip_id === trip || row.id === trip;
const t = backup.tables;

console.log(`Backup of ${backup.source}, made ${backup.at}`);
console.log('Trips in it:');
for (const tr of t.trips ?? []) {
  const name = (t.entities ?? []).find((e) => e.id === tr.id && e.type === 'trip')?.data?.name ?? '(no name)';
  const n = (t.entities ?? []).filter((e) => e.trip_id === tr.id && !e.deleted).length;
  console.log(`  ${tr.id}  ${name}  (${n} items)`);
}
const plan = [
  ...(args.includes('--with-profiles') && t.profiles ? [['profiles', 'id', t.profiles]] : []),
  ['trips', 'id', (t.trips ?? []).filter((r) => !trip || r.id === trip)],
  ['trip_members', 'trip_id,user_id', (t.trip_members ?? []).filter(inTrip)],
  ['entities', 'id', (t.entities ?? []).filter(inTrip)],
  ...(args.includes('--with-history') && t.changes ? [['changes', 'id', t.changes.filter(inTrip)]] : []),
];
if (trip && !plan[plan.findIndex(([n]) => n === 'trips')][2].length) {
  console.error(`Trip ${trip} isn't in this backup. Trips: ${(t.trips ?? []).map((r) => r.id).join(', ')}`);
  process.exit(1);
}
for (const [name, , rows] of plan) console.log(`${name}: ${rows.length} rows to put back`);

const db = connection();
let extra = [];
if (args.includes('--exact')) {
  // Items of these trips that the backup doesn't have: created since, so deleted by the restore.
  const trips = new Set(plan.find(([n]) => n === 'trips')[2].map((r) => r.id));
  const kept = new Set(plan.find(([n]) => n === 'entities')[2].map((r) => r.id));
  const now = (await readTable(db, 'entities', 'id')) ?? [];
  extra = now.filter((r) => trips.has(r.trip_id) && !kept.has(r.id) && !r.deleted).map((r) => ({ ...r, deleted: true }));
  console.log(`entities: ${extra.length} created since the backup, to delete`);
}

if (!write) {
  console.log('Nothing written. Add --yes to restore.');
  process.exit(0);
}
// The database stamps restored items with the current time, so every planner fetches them again.
const strip = (row) => {
  const { updated_at: _a, updated_by: _b, ...rest } = row;
  return rest;
};
for (const [name, key, rows] of plan) {
  await upsert(db, name, key, name === 'entities' ? rows.map(strip) : rows);
  console.log(`${name}: restored`);
}
if (extra.length) {
  await upsert(db, 'entities', 'id', extra.map(strip));
  console.log(`entities: ${extra.length} deleted`);
}
console.log('Done. Reload the planner (or wait for its next sync).');
