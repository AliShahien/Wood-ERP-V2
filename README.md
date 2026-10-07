# Edge Wood ERP

Cloud manufacturing ERP for a wooden door factory with showrooms — bilingual (Arabic RTL / English LTR).

**Flow:** customer → door gallery → measurement → quotation → approval → sales order → manufacturing order
→ BOM material requirements → stock check → material issue → production stages → QC → delivery →
invoice → payment → cost analysis → reports. Purchasing: purchase request → PO → goods receipt → stock →
supplier invoice → supplier payment.

## Stack
Next.js 16 · React 19 · TypeScript · Tailwind 4 · Prisma 7 · PostgreSQL (Supabase) · Supabase Storage ·
Chromium PDFs · Vitest · Playwright. Domain logic lives in `packages/core` (framework-independent).

## Quick start (development, Windows/macOS/Linux — no Docker needed)
```bash
npm install
cp .env.example .env          # set AUTH_SECRET, SEED_ADMIN_PASSWORD, SEED_DEMO_DATA=true
npm run db:local              # terminal 1: PostgreSQL 17 on :54329
npm run db:deploy && npm run db:seed
npm run dev                   # http://localhost:3000
```

## Quality gates
```bash
npm run typecheck && npm test && npm run build
npm run test:e2e
npm run smoke -- http://localhost:3000 security
npm run restore:test
```

## Documentation
[Architecture](docs/ARCHITECTURE.md) · [Database & ERD](docs/DATABASE.md) · [Workflows](docs/WORKFLOWS.md) ·
[Authorization](docs/AUTHORIZATION.md) · [Business rules](docs/BUSINESS_RULES.md) · [API](docs/API.md) ·
[Bilingual](docs/BILINGUAL.md) · [Deployment](docs/DEPLOYMENT.md) · [Hostinger](docs/HOSTINGER.md) ·
[Supabase](docs/SUPABASE.md) · [Environment](docs/ENVIRONMENT.md) · [Backup](docs/BACKUP.md) ·
[Testing](docs/TESTING.md) · [Acceptance](docs/ACCEPTANCE.md) · [Project plan](PROJECT_PLAN.md)
