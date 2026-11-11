# Backing up the shared database

Free Supabase projects have no backups you can download, so the planner makes its own: the whole
shared database (trips, members, profiles, invites, every item, and the history) in one file.
Each person's browser also keeps its own copy of the trips it opened, and **Export → trip backup
(JSON)** saves one trip as a file at any time; this is the copy of everything, for everyone.

## Every night, on GitHub (recommended)

[`.github/workflows/backup.yml`](../.github/workflows/backup.yml) runs at 03:23 UTC and keeps each
night's backup for 30 days, encrypted (the repository is public, and so are its workflow files;
the backups can only be read with the passphrase). To turn it on, add two repository secrets
(GitHub → Settings → Secrets and variables → Actions → New repository secret):

- `SUPABASE_SECRET_KEY`: Supabase → Project settings → API keys → **Secret keys** (create one,
  e.g. "backups"; `sb_secret_…`). The older `service_role` key works too. It reads everything
  regardless of the access rules: never put it in the code, the `.env` file or a message.
- `BACKUP_PASSPHRASE`: any long phrase. Keep it somewhere safe (a password manager): without it
  the backups can't be read.

Then Actions → **Back up the database** → **Run workflow** once to check. Each run has an
artifact `planner-database-…` with `planner-YYYY-MM-DD.json.gz.enc` inside (download the zip,
unzip it).

GitHub stops scheduled workflows in repositories without commits for 60 days; a push brings them
back (the keep-awake workflow has the same limit).

## On your own computer

Create `.env.backup.local` in the project folder (ignored by git, like every `*.local` file):

```
SUPABASE_SECRET_KEY=sb_secret_…
BACKUP_PASSPHRASE=…
```

`npm run backup` then saves `backups/planner-YYYY-MM-DD.json.gz(.enc)` (`backups/` is ignored by
git too; leave `BACKUP_PASSPHRASE` out for an unencrypted file). `--no-history` leaves the history
out; `--out <folder>` saves elsewhere (e.g. iCloud Drive). To run it every day on a Mac, `crontab
-e` and add a line such as
`30 21 * * * cd "/path/to/bikepacking-planner" && /usr/local/bin/npm run backup >> backups/log.txt 2>&1`
(it runs when the Mac is awake at that time).

## Restoring

```
npm run restore -- backups/planner-2027-04-01.json.gz.enc                    # what's in it
npm run restore -- <file> --trip <trip id> --exact --yes                     # put one trip back
```

Without `--yes` nothing is written. A restore puts back the trips, their members and every item as
they were in the backup; `--exact` also deletes the items created since (otherwise they stay);
`--with-history` puts the history back (with the restore time as its time); `--with-profiles`
names and colours. Everyone's planner fetches the restored items at its next sync (reload to see
them at once). `--extract plain.json` just writes the backup as readable JSON. Accounts (sign-in
emails) are Supabase's own and aren't in the backup: after losing the whole project, people sign
in again and are invited to the restored trips.

The restore summary (without `--yes`) lists the trips in the backup with their names and ids.
