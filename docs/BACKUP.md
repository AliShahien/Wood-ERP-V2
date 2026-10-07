# Backup and disaster recovery

## What must be backed up
| Asset | Where | Method |
|---|---|---|
| Database | Supabase PostgreSQL | Supabase daily backups (Pro: 7 days) + **PITR add-on recommended** + our nightly logical backup |
| Files | Supabase Storage (private buckets) | nightly copy of all buckets to a second provider (rclone/S3) |
| Config | `.env` | password manager; never in Git |
| Code | Git remote | — |

The Hostinger server holds no business data and can be rebuilt from Git + `.env`.

## Two independent database backups

1. **pg_dump** (preferred where the binary exists — e.g. the VPS):
   ```bash
   pg_dump "$DIRECT_DATABASE_URL" --format=custom --no-owner --no-privileges --file "edge-erp-$(date +%F).dump"
   pg_restore --no-owner --no-privileges --dbname "$RESTORE_URL" edge-erp-YYYY-MM-DD.dump
   ```
2. **Application logical backup** (`scripts/backup.mjs`, needs only Node — works on every Hostinger plan):
   ```bash
   npm run backup                          # → .local/backups/edge-erp-<timestamp>.edgebak.gz
   # restore into an EMPTY database that already has the schema:
   DATABASE_URL=$RESTORE_URL npm run db:deploy
   RESTORE_DATABASE_URL=$RESTORE_URL node scripts/restore.mjs <file>
   ```
   - One consistent snapshot (`REPEATABLE READ READ ONLY`), tables in foreign-key order.
   - Rows are kept as PostgreSQL JSON text and re-parsed by PostgreSQL (`json_populate_recordset`),
     so decimals/timestamps/enums are exact; cyclic/self FKs are restored as NULL then updated.
   - Restore refuses a non-empty target.

Schedule on the VPS (cron, 02:00 Africa/Cairo), copy the file off-site, keep **30 daily + 12 monthly**.

## Restore test

`npm run restore:test` = backup the dev DB → create `edge_erp_restore` → migrate → restore → compare row
counts **and md5 content checksums** of the ledger/stock/financial tables → verify immutability triggers.

| Date | Source | Rows | Duration | Result |
|---|---|---|---|---|
| 2026-09-25 | local dev DB (74 tables) | 804 | 5 s | **PASS** — identical counts and checksums for inventory_transactions, inventory_balances, party_ledger_entries, cash_transactions, customer_invoices, customer_payments, materials, audit_logs, users; triggers active |

A restore test must be repeated on the production data (into a staging database) before go-live and
quarterly afterwards; add a row here each time.

## Targets
- RPO: ≤ 24 h with daily backups (minutes with Supabase PITR). RTO: ≤ 4 h.

## Disaster recovery runbook
1. Create a new Supabase project (or restore via PITR in the existing one).
2. `npm run db:deploy` against it, then restore the latest backup (pg_restore or `scripts/restore.mjs`).
3. `npm run storage:init`, then copy the storage backup into the buckets.
4. Point `DATABASE_URL`/`DIRECT_DATABASE_URL`/`SUPABASE_*` in `.env` to the new project; restart `web` + `worker`.
5. Smoke test: `node scripts/smoke.mjs https://erp.example.com security` (with a test account).
