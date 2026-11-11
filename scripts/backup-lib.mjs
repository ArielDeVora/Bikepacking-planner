// Shared by scripts/backup.mjs and scripts/restore.mjs: talking to Supabase with the secret key,
// and reading/writing backup files (gzip, optionally encrypted with a passphrase).

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';

/** Errors as one readable line, not a stack trace. */
export function friendlyErrors() {
  loadLocalSecrets();
  process.on('uncaughtException', (err) => {
    console.error(`Error: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  });
}

/** Tables backed up, in the order they're restored (parents first). */
export const TABLES = [
  { name: 'profiles', key: 'id' },
  { name: 'trips', key: 'id' },
  { name: 'trip_members', key: 'trip_id,user_id' },
  { name: 'invites', key: 'token' },
  { name: 'entities', key: 'id' },
  { name: 'changes', key: 'id' },
];

export const FORMAT = 'bikepacking-planner-database';
const MAGIC = Buffer.from('BPDB1');

/** Values from a KEY=value file, if it exists. */
function readEnvFile(path) {
  try {
    return Object.fromEntries(
      readFileSync(path, 'utf8')
        .split('\n')
        .map((l) => l.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/))
        .filter(Boolean)
        .map((m) => [m[1], m[2]]),
    );
  } catch {
    return {};
  }
}

/**
 * Secrets for backups on this computer: the environment, else `.env.backup.local` (ignored by
 * git, like every *.local file).
 */
export function loadLocalSecrets() {
  const local = readEnvFile('.env.backup.local');
  for (const k of ['SUPABASE_SECRET_KEY', 'BACKUP_PASSPHRASE', 'SUPABASE_URL']) if (!process.env[k] && local[k]) process.env[k] = local[k];
}

/** Supabase URL and secret key, from the environment (or VITE_SUPABASE_URL in .env for the URL). */
export function connection() {
  let url = process.env.SUPABASE_URL;
  if (!url) {
    try {
      url = readFileSync('.env', 'utf8').match(/^VITE_SUPABASE_URL=(.*)$/m)?.[1]?.trim();
    } catch {
      /* no .env */
    }
  }
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    throw new Error(
      'Set SUPABASE_SECRET_KEY (Supabase → Project settings → API keys → secret key; never commit it). ' +
        'SUPABASE_URL comes from .env if not set.',
    );
  }
  // New secret keys (sb_secret_…) go in the apikey header only; older service_role keys are JWTs.
  const headers = { apikey: key, ...(key.startsWith('sb_') ? {} : { Authorization: `Bearer ${key}` }) };
  return { url: url.replace(/\/$/, ''), headers };
}

/** Every row of a table, a page at a time. */
export async function readTable({ url, headers }, table, order) {
  const rows = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const res = await fetch(`${url}/rest/v1/${table}?select=*&order=${order}`, {
      headers: { ...headers, 'Range-Unit': 'items', Range: `${from}-${from + PAGE - 1}` },
    });
    if (res.status === 404) return null; // table not there (e.g. history not set up)
    if (!res.ok) throw new Error(`${table}: HTTP ${res.status} ${await res.text()}`);
    const page = await res.json();
    rows.push(...page);
    if (page.length < PAGE) return rows;
  }
}

/** Writes rows (insert, or update when the key exists), in batches. */
export async function upsert({ url, headers }, table, key, rows) {
  const BATCH = 500;
  for (let i = 0; i < rows.length; i += BATCH) {
    const res = await fetch(`${url}/rest/v1/${table}?on_conflict=${key}`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(rows.slice(i, i + BATCH)),
    });
    if (!res.ok) throw new Error(`${table}: HTTP ${res.status} ${await res.text()}`);
  }
}

/** The backup as bytes: gzipped JSON, encrypted (AES-256-GCM, key from the passphrase) if one is given. */
export function pack(backup, passphrase) {
  const zipped = gzipSync(Buffer.from(JSON.stringify(backup)));
  if (!passphrase) return zipped;
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', scryptSync(passphrase, salt, 32), iv);
  const body = Buffer.concat([cipher.update(zipped), cipher.final()]);
  return Buffer.concat([MAGIC, salt, iv, cipher.getAuthTag(), body]);
}

export function unpack(bytes, passphrase) {
  let zipped = bytes;
  if (bytes.subarray(0, MAGIC.length).equals(MAGIC)) {
    if (!passphrase) throw new Error('This backup is encrypted: set BACKUP_PASSPHRASE.');
    let o = MAGIC.length;
    const salt = bytes.subarray(o, (o += 16));
    const iv = bytes.subarray(o, (o += 12));
    const tag = bytes.subarray(o, (o += 16));
    const decipher = createDecipheriv('aes-256-gcm', scryptSync(passphrase, salt, 32), iv);
    decipher.setAuthTag(tag);
    try {
      zipped = Buffer.concat([decipher.update(bytes.subarray(o)), decipher.final()]);
    } catch {
      throw new Error('Wrong passphrase (or a damaged file).');
    }
  }
  const backup = JSON.parse(gunzipSync(zipped).toString('utf8'));
  if (backup.format !== FORMAT) throw new Error('Not a planner database backup.');
  return backup;
}
