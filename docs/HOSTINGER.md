# Hostinger deployment

The app is a Node.js server (Next.js standalone output) that needs: Node ≥ 20.19, a long-running
process, outbound connections to Supabase (PostgreSQL 5432/6543 + HTTPS), and a periodic cron call.

## Which Hostinger plan works

| Plan type | Works? | Notes |
|---|---|---|
| **VPS (KVM)** — recommended | ✅ Full support | Docker or plain Node + PM2, reverse proxy, Let's Encrypt. Minimum KVM 1 (1 vCPU / 4 GB); KVM 2 (2 vCPU / 8 GB) recommended for production. |
| Business / Cloud web hosting with **Node.js Web Apps** | ⚠️ Works with limits | hPanel "Node.js app" deploy (GitHub/zip), set build & start commands and env vars. No Docker, no root, limited RAM/CPU and process limits — acceptable for a small team (≈ ≤ 30 concurrent users). Confirm in hPanel that your plan lists Node.js apps before buying. |
| Single / Premium shared hosting | ❌ | No persistent Node.js process. Would require moving the app server elsewhere (e.g. a VPS) and using Hostinger only for DNS. |

> The owner has not purchased a plan yet (2026-09-24). **Recommendation: Hostinger VPS KVM 2**
> with the Docker deployment below. It is the only option with no functional compromises
> (background worker, memory headroom for PDF generation, full log access).

## Option A — VPS with Docker (recommended)

1. Create the VPS with the Ubuntu 24.04 template (or "Ubuntu with Docker").
2. Point DNS: `A erp.example.com → <VPS IP>` (in Hostinger DNS zone).
3. On the server:
   ```bash
   sudo apt update && sudo apt install -y docker.io docker-compose-v2 git
   git clone <repo> /opt/edge-erp && cd /opt/edge-erp
   cp .env.example .env    # fill production values (see ENVIRONMENT.md), plus APP_DOMAIN=erp.example.com
   docker compose -f docker/docker-compose.prod.yml up -d --build
   ```
   The compose file runs `web` (Next.js on :3000), `worker` (job queue + scheduled checks every
   15 min) and `caddy` (reverse proxy with automatic HTTPS on 80/443). The image contains Chromium
   and Noto Arabic fonts for PDF generation.
4. Run migrations + seed once (and migrations on every release):
   ```bash
   docker compose -f docker/docker-compose.prod.yml run --rm web npm run db:deploy
   docker compose -f docker/docker-compose.prod.yml run --rm web npm run db:seed
   ```
5. Firewall (hPanel → VPS → Firewall): allow 22, 80, 443 only.
6. Logs: `docker compose -f docker/docker-compose.prod.yml logs -f web`. Restart policy: `unless-stopped`.

Release: `git pull && docker compose -f docker/docker-compose.prod.yml up -d --build`, then `db:deploy`.

## Option B — Business/Cloud "Node.js Web App"

| hPanel field | Value |
|---|---|
| Node version | 22.x (or newest ≥ 20.19 offered) |
| Build command | `npm ci && npm run build` |
| Start command | `npm run start` |
| Entry / port | the platform-provided `PORT` env var is honoured by `next start` |
| Environment variables | all of `.env.example` with production values |

- Migrations: run `npm run db:deploy` from your machine or CI against `DIRECT_DATABASE_URL`
  (shared hosting may not allow running it in the build step).
- Background jobs: no separate worker process. Configure an hPanel **Cron Job** every 5 minutes:
  `curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://erp.example.com/api/v1/cron/run`
- PDF: Node.js web apps usually cannot install Chromium. If `npx playwright install chromium` is not
  possible there, PDFs return `errors.pdfUnavailable`; the **Print** view (browser → Save as PDF)
  still works with correct Arabic. This is a real limitation of shared plans → prefer the VPS.
- SSL: enable the free SSL in hPanel for the domain.
- Storage: files go to Supabase Storage — nothing is written to the Hostinger filesystem.

## Common

- The app does **not** depend on the local filesystem in production (`STORAGE_DRIVER=supabase`).
- Backups: database and storage are on Supabase — see `BACKUP.md`. The Hostinger server holds
  no business data and can be rebuilt from Git + `.env`.
- Keep `.env` readable only by the app user (`chmod 600 .env`).
