# Deployment

## Target architecture

```
Users ──HTTPS──► Hostinger (VPS: Caddy → Next.js web + worker)   ──TLS──► Supabase PostgreSQL (pooler :6543)
                                                                  ──HTTPS─► Supabase Storage (private buckets)
```

- Stateless app servers: no business data on the Hostinger machine. Scale by adding instances.
- Plan-specific instructions: [HOSTINGER.md](HOSTINGER.md). Database/storage: [SUPABASE.md](SUPABASE.md).

## Build and run

| Step | Command |
|---|---|
| Install | `npm ci` |
| Generate Prisma client | `npm run db:generate` (included in `build`) |
| Build | `npm run build` (Next.js `output: "standalone"`) |
| Migrate | `npm run db:deploy` (uses `DIRECT_DATABASE_URL`) |
| Seed reference data + admin | `npm run db:seed` (idempotent; `SEED_DEMO_DATA=false` in prod) |
| Start | `npm run start` (port `PORT`, default 3000) |
| Worker | `npm run worker -w @edge/web` (Docker) or cron → `/api/v1/cron/run` |

## Release checklist

1. `npm run typecheck && npm run lint && npm test && npm run build` pass in CI.
2. Take an on-demand database backup (Supabase dashboard) before migrations that alter data.
3. `npm run db:deploy`, then deploy the new app version.
4. Smoke test: login, open dashboard, open a quotation PDF.
5. Check logs for errors in the first 15 minutes.

## Docker

`docker/Dockerfile` (multi-stage, non-root user, standalone output) and
`docker/docker-compose.prod.yml` (web, worker, caddy). Local development does **not** need Docker:
`npm run db:local` starts an embedded PostgreSQL 17.

## Logging and monitoring

- Structured JSON logs to stdout (`level`, `msg`, `requestId`, `userId`, `route`, `durationMs`).
- Logged: errors, auth failures, API 5xx, job failures, critical business events (postings, reversals).
- Never logged: passwords, session tokens, cookies, `Authorization` headers, service-role key.
- Health endpoint: `GET /api/health` (DB connectivity) for uptime monitoring.
