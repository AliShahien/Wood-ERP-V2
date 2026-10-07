# Environment variables

Template: `.env.example`. Real values live only in `.env` (git-ignored) or the host's secret store.

| Variable | Required | Scope | Description |
|---|---|---|---|
| `NODE_ENV` | yes | server | `production` in production |
| `TZ` | yes | server | Business timezone, e.g. `Africa/Cairo` (document dates, "today", daily jobs). Docker image defaults to it |
| `APP_URL` | yes | server | Public origin, e.g. `https://erp.example.com`. Used for CSRF origin check and links |
| `DATABASE_URL` | yes | server | Runtime connection (Supabase transaction pooler :6543) |
| `DIRECT_DATABASE_URL` | yes (migrations) | server | Direct/session connection (:5432) for `prisma migrate deploy` and seed |
| `DATABASE_POOL_MAX` | no | server | Max connections per app instance (default 10; keep ≤ 5 on shared hosting) |
| `AUTH_SECRET` | yes | server | ≥ 32 random chars; HMAC key for session tokens. Rotating it logs everyone out |
| `SESSION_TTL_HOURS` | no | server | Session lifetime (default 12) |
| `STORAGE_DRIVER` | yes | server | `supabase` (prod) or `local` (dev only) |
| `LOCAL_STORAGE_DIR` | dev | server | Folder for `local` driver |
| `SUPABASE_URL` | prod | server | Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | prod | **server only** | Storage admin key. Never `NEXT_PUBLIC_`, never sent to browser, never logged |
| `SUPABASE_ANON_KEY` | no | — | Unused (reserved) |
| `STORAGE_BUCKET_PREFIX` | no | server | Prefix for bucket names (e.g. `staging-`) |
| `MAX_UPLOAD_MB` | no | server | Upload size limit (default 15) |
| `EMAIL_HOST/PORT/USER/PASSWORD/FROM` | no | server | SMTP for email notifications |
| `CRON_SECRET` | yes | server | Bearer token for `/api/v1/cron/run` |
| `SEED_ADMIN_USERNAME/PASSWORD/EMAIL` | first deploy | server | Initial Super Admin (must change password on first login in production) |
| `SEED_DEMO_DATA` | no | server | `true` only in dev/demo. Seed refuses demo data when `NODE_ENV=production` |

No variable is prefixed `NEXT_PUBLIC_`: the browser receives nothing from the environment.
