# Architecture

## 1. Overview

Edge Wood ERP is a single integrated manufacturing ERP. Every module shares one PostgreSQL
database and one domain layer, so business rules (stock, costing, balances, status transitions)
are enforced in exactly one place.

```
Browser (Next.js React UI, RTL/LTR)
   │  HTTPS, httpOnly session cookie
   ▼
Next.js server (apps/web)
   ├─ Route handlers  /api/v1/*   ← REST API (OpenAPI documented)
   ├─ Server components            ← call the same services directly for page rendering
   ▼
@edge/core  (packages/core)       ← domain services: validation, permissions, workflows, posting
   ▼
@edge/db    (packages/db)         ← Prisma client + schema + migrations (data access)
   ▼
PostgreSQL (Supabase in production, embedded PostgreSQL 17 locally)

Storage provider interface ──► Supabase Storage (prod) | local filesystem (dev)
```

Layering rule: **UI → API → Service → Data access → PostgreSQL**. UI components never contain
business logic; they call the API (client components) or services (server components).
Services never read HTTP objects; they receive a `ServiceContext { db, actor, meta }`.

## 2. Repository layout

| Path | Purpose |
|---|---|
| `apps/web` | Next.js 16 app: pages, layout, REST route handlers, auth cookie handling |
| `packages/core` | Domain layer: services per module, permission catalog, state machines, numbering, audit, seed |
| `packages/db` | Prisma schema, SQL migrations, generated client, connection factory |
| `packages/i18n` | Arabic/English UI message catalogs and helpers |
| `tests/` | Global test setup, Playwright end-to-end tests |
| `scripts/` | Local dev database, backup/restore helpers |
| `docker/` | Dockerfile and compose for VPS deployment |
| `docs/` | This documentation |

`apps/api` from the original brief is intentionally **not** created: the Next.js route handlers
are the API. Because all logic lives in `@edge/core`, a separate NestJS/Fastify API can be added
later by mounting the same services — no business logic would move.

## 3. Key decisions

| Decision | Choice | Why |
|---|---|---|
| Framework | Next.js 16 (App Router) + React 19 + TypeScript | One deployable unit, SSR for gallery/SEO, works on any Node host |
| ORM | Prisma 7 with `@prisma/adapter-pg` | Typed queries, migrations; driver adapter works with Supabase pooler |
| Auth | **Application-level** sessions (not Supabase Auth) | Keeps Supabase replaceable; RBAC lives in the same DB; instant revocation; no JWT refresh complexity. Passwords: Argon2id. Session token: 256-bit random, stored as HMAC-SHA256 |
| Authorization | Permission keys checked in every service method + data scope (ALL / SHOWROOM / OWN) + warehouse assignment | Never rely on the frontend; role codes are never checked in code |
| Supabase usage | PostgreSQL + Storage only | No business logic in Edge Functions; see `SUPABASE.md` |
| RLS | Enabled on every table with **no policies** | The app connects as owner (bypasses RLS); PostgREST roles `anon`/`authenticated` get nothing even if a key leaks |
| IDs | UUIDv7 primary keys, human numbers in `code`/`number` | No sequential ID exposure; time-ordered for index locality |
| Numbering | `document_sequences` row locked via `INSERT … ON CONFLICT DO UPDATE … RETURNING` inside the business transaction | Unique and gap-free under concurrency; rolls back with the document |
| Inventory | Immutable `inventory_transactions` ledger + `inventory_balances` (updated in the same transaction under row lock) + `CHECK (quantity >= 0)` | Transaction-based, no overwrites, negative stock impossible |
| Money | `numeric(18,2)`; quantities `numeric(18,4)`; decimal.js-style arithmetic via Prisma Decimal | No floating-point money |
| Costing | Moving weighted average cost per material | Matches "average cost" in spec; simple and auditable |
| Receivables/payables | `party_ledger_entries` sub-ledger (debit/credit, immutable) | Balances always derived from transactions; ready to map to a general ledger later |
| Background jobs | PostgreSQL `jobs` table (`FOR UPDATE SKIP LOCKED`) + cron-triggered endpoint | No extra infrastructure (Redis) needed on Hostinger |
| i18n | File-based catalogs (`packages/i18n`) + optional DB overrides (`translations`) | Labels never hardcoded; master data stored as entered |

## 4. Request lifecycle (mutating API call)

1. Route handler checks `Origin` (CSRF), rate limit, reads the session cookie.
2. `resolveSession` → `Actor` (permissions, scope, showroom, warehouses).
3. Handler calls a service with `ServiceContext` and the raw JSON body.
4. Service: `requirePermission` → zod validation → scope check → `db.$transaction(...)`:
   business rules, row locks, numbering, ledger postings, `audit(...)`.
5. Errors are `AppError { code, messageKey, details }` → JSON `{ error: { code, messageKey, details } }`
   with the right HTTP status. The UI translates `messageKey`.

## 5. Extensibility

- **Future accounting:** ledger entries carry `document_type/document_id`; a GL posting job can
  translate them into journal entries without changing documents.
- **QR codes:** every record has a stable UUID and a human number; `/r/{entity}/{id}` resolver route
  is reserved for QR deep links.
- **Customer / supplier portal:** services already filter by actor scope; a portal actor type
  with `OWN`-style scoping on `customer_id` can reuse them.
- **Replace Supabase:** swap `DATABASE_URL` (any PostgreSQL 15+) and implement the
  `StorageProvider` interface for S3/R2/MinIO.
