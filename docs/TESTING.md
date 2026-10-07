# Testing

| Suite | Tool | Command | What |
|---|---|---|---|
| Unit + integration (services on real PostgreSQL) | Vitest | `npm test` | 52 tests in `packages/*/test` |
| HTTP smoke per phase | Node | `npm run smoke -- http://localhost:3000 <phase2…phase8\|security>` | API + page rendering against a running server |
| End-to-end browser | Playwright | `npm run test:e2e` | login, RTL/LTR, UI customer creation, gallery, key screens, mobile |
| Volume / performance | Node | `node scripts/perf-check.mjs` | 200k customers on the test DB, query timings + plan |
| Backup / restore | Node | `npm run restore:test` | backup → fresh DB → restore → checksum compare |

Prerequisite: `npm run db:local` (PostgreSQL 17). `tests/global-setup.ts` **drops and rebuilds**
`edge_erp_test` from migrations on every run (migrations are validated each time) and refuses any
database whose name does not end in `_test`.

## Mandatory scenarios (spec §72–73, §86)

- [x] Critical flow customer → product → quotation → approval → SO → MO → material issue → production → QC → delivery → invoice → payment (`full-flow.test.ts`)
- [x] Inventory concurrency: stock 10, A requests 8, B requests 5 → exactly one succeeds, never negative, ledger = balance (`manufacturing.test.ts`)
- [x] Concurrent quotation conversion → exactly one sales order; numbering unique & gap-free under 50 parallel transactions
- [x] Immutability: audit log, stock/party/cash ledgers, posted documents, approved measurements (DB triggers)
- [x] RLS enabled on every table (Supabase Data API lock-out)
- [x] Permissions: custom roles, super-admin escalation blocked, cost masking, report permissions, data scope ALL/SHOWROOM/OWN
- [x] Unauthorized HTTP requests: 401 anonymous, 403 missing permission, 404 out-of-scope, CSRF blocked (`smoke security`)
- [x] Arabic/English, RTL/LTR, Arabic PDF shaping (Playwright + visual PDF check)
- [x] Production build + production-mode server (Secure cookie, HSTS, strict CSP)
- [x] Backup and restore
- [ ] Docker image build (not possible on the build machine — Docker Desktop needs WSL2; build on the VPS)
- [ ] Supabase Storage driver against a real project (no project yet — `npm run storage:init` then upload smoke)

## Latest results (2026-09-25)

- Vitest: **52/52 passed**
- Smoke phase2–phase8 + security: **all passed** (dev and production build)
- Playwright: **7/7 passed** (desktop + mobile)
- Perf (200k customers): name search 34 ms (trigram index), phone 5 ms, page 3 ms, count 92 ms
- Restore test: **PASS**
