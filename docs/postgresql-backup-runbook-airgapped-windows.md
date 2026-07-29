# PostgreSQL Backup & Recovery Runbook
## JAI-School · Windows Server 2022 · Air-Gapped Production

**Application:** JAI-School (FastAPI + React, PostgreSQL 17 backend)
**Database:** `jai_school` on `localhost:5432` (connection string in `backend\.env` → `DATABASE_URL`)
**Backend process:** Windows service `JAI-School` (NSSM), deployed by `scripts/deploy.ps1`
**Scope:** Nightly logical dumps + weekly physical base backups, retention, monitoring, and restore.
**Last reviewed:** _____________  **Owner:** _____________  **On-call:** _____________

> Print this runbook and store a copy offline. In an air-gapped incident you cannot look it up online.

---

## 1. Approach

This uses **only PostgreSQL's built-in tools** (`pg_dump`, `pg_basebackup`,
`pg_restore`), which run natively on Windows and need **nothing extra brought
across the air-gap** beyond PostgreSQL itself. The production-grade Linux tools
(`pgBackRest`, `WAL-G`, `Barman`) do not run natively on Windows, so they are
deliberately avoided.

Two complementary layers, both scripted and scheduled (§4):

| Layer | Tool | Frequency | Gives you |
|---|---|---|---|
| **Logical dump** | `pg_dump -Fc` | Nightly 02:00 | Portable, cross-machine restore; **single-table** restore; small |
| **Physical base backup** | `pg_basebackup -Xs` | Weekly Sun 01:30 | Fast **whole-cluster** disaster recovery to the weekly point |

**Recovery objectives (current design):**
- **RPO (max data loss):** up to ~24h (last nightly dump). Acceptable per current policy.
- **RTO (max restore time):** measure it during a restore drill (§7) and record it here: _______
- **Retention:** logical dumps 14 days, base backups 4 weeks (both configurable).

> **No continuous WAL archiving / PITR** in this design — it is the most
> failure-prone piece on Windows (a stuck archiver can *halt the database*) and
> RPO ~24h is acceptable. If sub-24h RPO is later required, see **Appendix B**.

---

## 2. Scripts (committed)

All under `scripts/backup/`, following the same house style as `scripts/deploy.ps1`
(strict mode, event-log-on-failure, non-zero exit on error). They read the DB
name/host/port/user/password from `backend\.env` (`DATABASE_URL`) — a single
source of truth, no second copy of credentials.

| Script | Role |
|---|---|
| `lib.ps1` | Shared helpers (parse `DATABASE_URL`, locate PG bin, event logging). Dot-sourced by the others. |
| `Backup-Database.ps1` | Nightly `pg_dump -Fc` → `<root>\logical`, prune > `-RetentionDays`. |
| `Backup-BaseBackup.ps1` | Weekly `pg_basebackup -Ft -z -Xs` → `<root>\base`, prune > `-RetentionWeeks`. |
| `Test-BackupHealth.ps1` | Daily check: dump/base freshness + free disk; warns via event log. |
| `Install-BackupTasks.ps1` | One-time (elevated): registers the event source, backup dirs, and the three Scheduled Tasks. |

All backup activity logs to the **Windows Application event log** under source
`JAI-School-Backup` (event ids: `100` success, `150` warning, `200` error).

---

## 3. Storage layout

**Current state: single disk.** Backups are written under a configurable
`-BackupRoot` (e.g. `D:\pg_backups`):

```
D:\pg_backups\
  logical\   jai_school_YYYYMMDD_HHMMSS.dump      (nightly)
  base\      base_YYYYMMDD_HHMMSS\base.tar.gz + pg_wal.tar.gz   (weekly)
```

> ⚠️ **Known limitation:** backups on the **same physical disk** as the database
> do not survive a disk failure. Treat separate-disk + offsite (Appendix A) as
> the first hardening step once the basics are running.

**Service account:** the PostgreSQL service and the backup tasks need read access
to the data and write access to `-BackupRoot`. The tasks run as `SYSTEM` by
default (see §4); pass a domain service account to `Install-BackupTasks.ps1` if
the backup target is a network share.

---

## 4. Install & schedule

From an **elevated** PowerShell on the prod box, on a checkout of the repo:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\backup\Install-BackupTasks.ps1 `
    -BackupRoot D:\pg_backups
```

This registers the `JAI-School-Backup` event source, creates
`D:\pg_backups\{logical,base}`, and installs three Scheduled Tasks (idempotent —
re-run any time to update paths/retention):

| Task | Schedule |
|---|---|
| `JAI-School Nightly DB Dump` | Daily 02:00 |
| `JAI-School Weekly Base Backup` | Sunday 01:30 |
| `JAI-School Backup Health Check` | Daily 07:30 |

Optional flags: `-RetentionDays 14`, `-RetentionWeeks 4`, `-PgBin <path>`,
`-RunAsUser DOMAIN\svc -RunAsPassword ***` (for a network-share target).

Run one immediately to confirm:
```powershell
Start-ScheduledTask -TaskName "JAI-School Nightly DB Dump"
```

---

## 5. Recovery

### 5.1 Logical restore (single table or whole DB — the common case)

Restore a nightly dump. **Always practise into a scratch DB first**, then decide
whether to overwrite production.

```powershell
$bin  = 'C:\Program Files\PostgreSQL\17\bin'
$dump = 'D:\pg_backups\logical\jai_school_20260706_020001.dump'
$env:PGPASSWORD = 'postgres'   # or read from backend\.env

# Whole database into a scratch copy to verify the dump:
& "$bin\createdb.exe"  -U postgres jai_school_restore_test
& "$bin\pg_restore.exe" -U postgres -d jai_school_restore_test --clean --if-exists $dump

# Single table into the live DB (example: attendances):
& "$bin\pg_restore.exe" -U postgres -d jai_school --clean --if-exists -t attendances $dump
```

> To overwrite the live DB entirely, stop the backend first so it isn't writing:
> `nssm stop JAI-School`, restore into `jai_school`, then `nssm start JAI-School`.

### 5.2 Whole-cluster restore from a base backup (disaster recovery)

Use when the data directory is lost/corrupt. Restores to the **weekly** point.

1. Stop both services:
   ```powershell
   nssm stop JAI-School
   Stop-Service postgresql-x64-17
   ```
2. Move the old data dir aside (don't delete until verified), e.g. rename
   `C:\Program Files\PostgreSQL\17\data` → `data.old`, and recreate an empty `data`.
3. Extract the chosen base backup into the new data dir:
   ```powershell
   $base = 'D:\pg_backups\base\base_20260705_013000'
   tar -xf "$base\base.tar.gz"   -C 'C:\Program Files\PostgreSQL\17\data'
   tar -xf "$base\pg_wal.tar.gz" -C 'C:\Program Files\PostgreSQL\17\data\pg_wal'
   ```
   (`tar.exe` ships with Windows Server 2022. `-Xs` already streamed the WAL into
   `pg_wal.tar.gz`, so the snapshot is self-consistent — no WAL archive needed.)
4. Start and verify:
   ```powershell
   Start-Service postgresql-x64-17
   # psql: SELECT pg_is_in_recovery();  -> false once ready
   nssm start JAI-School
   ```

---

## 6. Monitoring

`Test-BackupHealth.ps1` runs daily and writes to the Application event log. Point
your LAN monitoring agent (Zabbix / Prometheus / etc.) or on-call at that log:

```powershell
# Recent backup events:
Get-WinEvent -LogName Application `
  -FilterXPath "*[System/Provider/@Name='JAI-School-Backup']" -MaxEvents 20
```

Alert on **event id 150 (Warning)** and **200 (Error)**. The check flags:
1. Newest logical dump older than ~26h (nightly missed / failed).
2. Newest base backup older than ~8 days (weekly missed / failed).
3. Backup volume free space below 10 GB.

---

## 7. Restore testing (do not skip)

**A backup you have never restored is a hope, not a backup.** Monthly:

1. Run §5.1 into `jai_school_restore_test` on a separate machine if possible.
2. Spot-check row counts against production for a couple of tables, e.g.:
   ```sql
   SELECT count(*) FROM users;
   SELECT count(*) FROM attendances;
   ```
3. Drop the scratch DB: `dropdb -U postgres jai_school_restore_test`.
4. Record how long the full restore took — **that number is your real RTO** (§1).

---

## 8. Go-live checklist

- [ ] PostgreSQL 17 installer SHA-256 verified offline before transfer
- [ ] `backend\.env` present with the real production `DATABASE_URL` (db `jai_school`)
- [ ] `-BackupRoot` chosen (ideally a **separate disk** from the PG data dir)
- [ ] `Install-BackupTasks.ps1` run elevated; three tasks visible in Task Scheduler
- [ ] Nightly dump task run once manually → non-empty `.dump` + event id 100
- [ ] Weekly base backup run once manually → `base.tar.gz` + `pg_wal.tar.gz` present
- [ ] Health check run once → passes; event source visible in Application log
- [ ] **First restore drill completed (§7); RTO recorded in §1**
- [ ] Monitoring/alerts wired to event ids 150 & 200
- [ ] (Hardening) offsite mirror and/or encryption configured (Appendix A)
- [ ] This runbook printed and stored offline; contacts filled in

---

## Appendix A — Hardening / offsite (recommended next steps)

Not required for go-live, but close the single-disk gap as soon as practical:

- **Separate disk:** point `-BackupRoot` at a different physical volume than the
  PG data directory so one disk failure can't take both.
- **Offsite within the air-gap:** mirror to a second LAN server on a schedule —
  ```powershell
  robocopy D:\pg_backups \\BACKUPSRV\jai_backups /MIR /Z /R:3 /W:10
  ```
  and/or rotate **encrypted removable media** to a separate physical location.
- **Encryption at rest:** enable **BitLocker** on the backup volume, and/or pass
  `-Encrypt` to `Backup-Database.ps1` (7-Zip AES-256; set `BACKUP_7Z_PASSWORD`,
  keep the passphrase in an **offline** secret store).
- **Least-privilege backup role** (instead of the `postgres` superuser):
  ```sql
  CREATE ROLE backupuser WITH REPLICATION LOGIN PASSWORD '***';
  ```
  Grant read on the schema for `pg_dump`, add a `replication` line to
  `pg_hba.conf`, store its password in `%APPDATA%\postgresql\pgpass.conf` for the
  task account, and point `DATABASE_URL` (or a dedicated env) at it.
- **Hot standby:** a streaming replica on a second Windows box gives HA *and* a
  live second copy to back up from without loading the primary.

## Appendix B — Optional: upgrade to PITR (sub-24h RPO)

If ~24h potential loss becomes unacceptable, layer continuous WAL archiving on
top of the weekly base backup to enable point-in-time recovery:

- `postgresql.conf`: `wal_level = replica`, `archive_mode = on`,
  `archive_command` = a wrapper that copies each WAL segment to an archive dir
  (fail non-zero if the target exists), `archive_timeout = 60` (≈1-min RPO).
  Changing `archive_mode`/`wal_level` needs a **service restart**.
- Restore then adds a `recovery.signal` file + `restore_command` +
  `recovery_target_time` in `postgresql.conf` (PG 12+ mechanism, **not** the
  legacy `recovery.conf`).
- ⚠️ **Operational cost:** a failing archiver fills `pg_wal` and eventually
  **halts the database** — you must monitor `pg_stat_archiver`
  (`failed_count`, `last_failed_time`) and archive-dir growth. This is why it is
  intentionally *out* of the default design.

## Appendix C — Out of scope: uploaded files

Uploaded documents are stored **outside PostgreSQL** on the filesystem at
`FILE_SHARING_UPLOAD_DIR` (`backend\private_uploads\files` by default). These
scripts back up the **database only**. A complete disaster-recovery plan must
also back up that directory (e.g. a nightly `robocopy` of the upload dir into
`-BackupRoot`). Track as a follow-up.

---

## Appendix D — Quick command reference

| Task | Command |
|---|---|
| Run nightly dump now | `Start-ScheduledTask -TaskName "JAI-School Nightly DB Dump"` |
| Manual dump | `pg_dump -U postgres -Fc -d jai_school -f D:\pg_backups\logical\manual.dump` |
| Manual base backup | `pg_basebackup -h localhost -U postgres -D D:\pg_backups\base\manual -Ft -z -Xs -P` |
| Restore whole DB (scratch) | `pg_restore -U postgres -d jai_school_restore_test --clean --if-exists <dump>` |
| Restore one table | `pg_restore -U postgres -d jai_school --clean --if-exists -t <table> <dump>` |
| Backup events | `Get-WinEvent -LogName Application -FilterXPath "*[System/Provider/@Name='JAI-School-Backup']" -MaxEvents 20` |
| Backend service | `nssm stop JAI-School` / `nssm start JAI-School` |

_Adjust the PostgreSQL version path (`\17\`) and `-BackupRoot` to your install._
