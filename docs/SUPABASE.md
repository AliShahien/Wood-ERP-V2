# Supabase

## Dependencies (complete list)

| Supabase feature | Used for | Replaceable by |
|---|---|---|
| PostgreSQL | all business data | any PostgreSQL 15+ (RDS, Neon, self-hosted) — change `DATABASE_URL` |
| Supavisor pooler | runtime connections (transaction mode) | PgBouncer or direct connections |
| Storage | attachments, product images, signatures, PDFs | S3 / R2 / MinIO via `StorageProvider` |
| Auth | **not used** | — |
| Realtime / Edge Functions | **not used** | — |
| PostgREST (Data API) | **not used — locked out by RLS** | — |

## Project setup

1. Create a project (region closest to users, e.g. Frankfurt `eu-central-1` for Egypt).
2. Settings → Database: copy
   - *Transaction pooler* URI (port 6543) → `DATABASE_URL`, append `?pgbouncer=true&connection_limit=5`
   - *Session pooler* or *Direct* URI (port 5432) → `DIRECT_DATABASE_URL`
3. Settings → API: copy project URL → `SUPABASE_URL`, `service_role` key → `SUPABASE_SERVICE_ROLE_KEY`
   (server only). The anon key is not needed.
4. Optional hardening: Settings → API → disable the Data API entirely (the app never uses it).
5. Run `npm run db:deploy` then `npm run db:seed` with production env vars.

## Storage buckets

All buckets are **private**. Files are served through the API (`/api/v1/attachments/:id`) which
checks permissions and returns a short-lived signed URL. Product gallery images use a longer-lived
signed URL cached per image.

| Bucket | Content |
|---|---|
| `products` | door images |
| `measurements` | measurement photos and drawings |
| `customers` | customer documents |
| `manufacturing` | production / QC photos |
| `documents` | generated PDFs, purchase & expense documents |
| `delivery` | delivery photos, customer signatures |
| `attachments` | everything else |

Buckets are created by `npm run storage:init` (idempotent) using the service-role key. With
`STORAGE_BUCKET_PREFIX` you can share one Supabase project between staging and production.

## Row Level Security

RLS is enabled on every table without policies, and privileges for `anon`/`authenticated` are
revoked (migration `*_integrity`). Result: even with a leaked anon key, the Data API returns nothing.
The application connects as the `postgres` owner role via the pooler and enforces authorization in
the service layer (see `AUTHORIZATION.md`). If direct client-side Supabase access is ever added,
explicit policies must be written first.

## Backups
See `BACKUP.md` — daily automatic backups on paid plans; PITR add-on recommended for production.
