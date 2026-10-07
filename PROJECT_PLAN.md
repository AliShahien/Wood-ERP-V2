# Edge Wood ERP — Project Plan

Status legend: ✅ done & verified · 🟡 in progress · ⬜ not started.
A task is ✅ only when it works and its tests pass.

| Phase | Task | Status | Depends on | Tests | Notes |
|---|---|---|---|---|---|
| 0 | Repository setup (npm workspaces, TS, git) | ✅ | — | — | Node 26 local; target Node ≥ 20.19 |
| 0 | Architecture doc | ✅ | — | — | docs/ARCHITECTURE.md |
| 0 | Prisma schema — all modules | ✅ | — | `prisma validate` | 70+ tables |
| 0 | Migrations (init + integrity: CHECKs, triggers, RLS) | ✅ | schema | rebuilt on every test run | |
| 0 | ERD | ✅ | schema | — | docs/DATABASE.md (mermaid) |
| 0 | Permission catalog + default role matrix | ✅ | — | auth.test.ts | docs/AUTHORIZATION.md |
| 0 | Workflows & state machines | ✅ | — | platform.test.ts | docs/WORKFLOWS.md |
| 0 | Seed system (reference, admin, demo) | ✅ | migrations | idempotency verified | demo = master data only |
| 0 | Local dev DB without Docker (embedded PG 17, UTF-8) | ✅ | — | — | `npm run db:local` |
| 0 | Deployment / Hostinger / Supabase / env docs | ✅ | — | — | plan not purchased yet → VPS recommended |
| 0 | Docker configuration | 🟡 | web app | — | Dockerfile + compose + Caddy written; image build NOT yet verified (Docker Desktop needs WSL2 on this machine) |
| 1 | Auth core (Argon2id, sessions, lockout, history) | ✅ | 0 | auth.test.ts | |
| 1 | Users / roles / permissions services | ✅ | auth | auth.test.ts | |
| 1 | Settings service (tax optional per document) | ✅ | — | — | |
| 1 | Audit infrastructure | ✅ | — | platform/auth tests | |
| 1 | i18n catalogs (ar/en) + RTL/LTR | ✅ | — | messages.test.ts (key parity, permission labels) | per-user language, cookie before login |
| 1 | Next.js app shell: login, layout, sidebar, topbar, mobile menu | ✅ | auth | manual render check AR/EN | Playwright e2e pending |
| 1 | API route handlers for Phase 1 + CSRF (Origin) + rate limit | ✅ | services | manual API smoke test (401/403/CSRF/logout) | automated API tests pending |
| 1 | Users / roles (permission matrix) / settings / audit / profile UI | ✅ | API | all pages render 200 in AR (rtl) and EN (ltr) | |
| 1 | Playwright e2e + automated API tests | ⬜ | UI | | next step |
| 2 | Customers (profile, addresses, contacts, balance from ledger, showroom scope), suppliers, showrooms | ✅ | 1 | master-data.test.ts (scope ALL/SHOWROOM/OWN), smoke phase2 | |
| 2 | Products, door gallery (search/filter/sort/pagination/lazy images), images, options, categories | ✅ | 1, storage | master-data.test.ts, smoke phase2 | images streamed via permission-checked route |
| 2 | Materials (Arabic names, cost masking, low stock), units, material categories, warehouses + locations | ✅ | 1 | master-data.test.ts | |
| 2 | Storage provider (Supabase REST + local signed URLs), attachments, magic-byte upload validation | ✅ | 1 | master-data.test.ts | Supabase driver untested against a real project (no project yet) |
| 3 | Quotations: pricing engine (per unit / per m², options), optional tax, workflow, revisions, live preview builder | ✅ | 2 | sales.test.ts (pricing exact decimals, transitions, override permission, revisions), smoke phase3 | |
| 3 | Sales orders: conversion (row lock, 1:1), cancel rules, status refresh | ✅ | quotations | concurrent conversion test | |
| 3 | Customer invoices (from SO, pro-rata discount), payments, allocations, reversals, AR ledger, cash accounts | ✅ | SO | full cycle balances to 0; reversal restores balance | |
| 3 | PDF engine (HTML → Chromium) with correct Arabic shaping/RTL + print view | ✅ | | smoke phase3 + visual check of AR PDF | Docker image must install Chromium + Noto Arabic fonts |
| 4 | Measurements + versions (approved = DB-frozen), tablet form, photos | ✅ | 2 | manufacturing.test.ts, smoke phase4 | |
| 4 | BOM + rules + safe formula evaluator (no eval), versions, test calculator | ✅ | 2 | formula injection tests, BOM calc exact | |
| 4 | Manufacturing orders from SO, BOM explosion, estimated cost (also on quotations) | ✅ | BOM, SO | lifecycle test | |
| 4 | Material issue / return / reversal (row-locked stock posting) | ✅ | inventory engine | concurrency test | |
| 4 | Production operations (board), QC with rework, actual cost & variance | ✅ | MO | lifecycle test, smoke phase4 | stage labor rates must be configured |
| 5 | Inventory engine (ledger, balances, moving average) + adjustments/opening/transfers + stock & movement screens | ✅ | 2 | stock 10 / 8 vs 5 concurrency test; avg cost test | |
| 5 | Purchase requests → orders (optional tax) → goods receipts (stock IN, avg cost, over-receipt guard, reversal guard) → supplier invoices → supplier payments, AP ledger | ✅ | inventory | purchasing.test.ts, smoke phase5 | receipt cost = PO net price excl. tax [DECISION] |
| 5 | Transfers, adjustments, opening balances | ✅ | inventory | manufacturing.test.ts | |
| 6 | Expenses (cash out, cancel=reversal, MO other cost), costing & variance reports, AR/AP aging, statements, 19 reports with CSV/Excel/PDF export | ✅ | 3–5 | finance.test.ts (all reports run, permission filtering), smoke phase6 | |
| 7 | Delivery (only manufactured qty), scheduling, partial/full confirmation, installation status, drawn customer signature, photos, delivery note PDF | ✅ | 4 | full-flow.test.ts (critical scenario §72), smoke phase7 | |
| 8 | Dashboards (live KPIs per permission), reports (done in 6), notifications (permission fan-out, dedupe, bell), global search, job queue + cron + worker | ✅ | all | platform-services.test.ts, smoke phase8, visual AR/EN check | |
| 9 | Security review (scope gaps fixed: attachments, deliveries), HTTP authorization smoke | ✅ | all | smoke security (dev + production build) | |
| 9 | Performance: trigram indexes, 200k-customer volume check | ✅ | all | perf-check (34 ms name search) | |
| 9 | Backup / restore tooling + restore test with checksums | ✅ | all | restore-test PASS | repeat on production data before go-live |
| 9 | Playwright e2e (RTL/LTR, UI flows, mobile) | ✅ | UI | 7/7 | |
| 9 | Production build + production-mode server check, OpenAPI, docs, acceptance list | ✅ | all | docs/ACCEPTANCE.md | |
| 9 | Production deployment (Hostinger VPS + Supabase) | 🟡 | owner | — | needs VPS purchase + Supabase project + secrets |

## Open business questions (non-blocking; defaults documented in docs/BUSINESS_RULES.md)
1. Must a deposit be received before manufacturing can start?
2. Costing method: moving weighted average (current default) vs FIFO?
3. Pricing model: base price per unit vs per m² — per product configurable (current default).
