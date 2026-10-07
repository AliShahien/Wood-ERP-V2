# REST API

Base path: `/api/v1`. JSON only. Authentication: session cookie `edge_session` (httpOnly).
Machine-readable spec: `GET /api/v1/openapi.json` (generated from the zod schemas).

## Conventions
- List endpoints: `?page=1&pageSize=20&q=&sort=&order=desc` + module filters →
  `{ items, total, page, pageSize, pageCount }`. `pageSize` max 100.
- Errors: `{ "error": { "code": "VALIDATION", "messageKey": "errors.validation", "details": [...] } }`

| HTTP | code |
|---|---|
| 401 | UNAUTHENTICATED |
| 403 | FORBIDDEN |
| 404 | NOT_FOUND (also for out-of-scope records) |
| 409 | CONFLICT, INVALID_TRANSITION, INSUFFICIENT_STOCK, IMMUTABLE |
| 422 | VALIDATION |
| 429 | RATE_LIMITED |

- State changes are explicit action endpoints (`POST /quotations/:id/submit`), never a writable `status` field.
- Mutations require an `Origin` header equal to `APP_URL`.

## Full catalog

All 160+ endpoints are listed in [API-ENDPOINTS.md](API-ENDPOINTS.md) (generated from the route
files by `node scripts/gen-api-docs.mjs`) and served as OpenAPI 3.1 at `GET /api/v1/openapi.json`.

Other conventions:
- Documents: `GET /api/v1/documents/{type}/{id}?format=pdf|html&lang=ar|en` for
  `quotation, sales_order, invoice, payment, manufacturing_order, material_issue, purchase_order, goods_receipt, delivery`.
- Reports: `GET /api/v1/reports/{id}?from&to&showroomId&warehouseId&format=json|csv|xlsx|pdf` (export needs `reports.export`).
- Uploads: `multipart/form-data` with a `file` field (`/attachments/upload`, `/products/{id}/images`, `/deliveries/{id}/signature`).
- Cron: `POST /api/v1/cron/run` with `Authorization: Bearer $CRON_SECRET` (no session).

## Endpoints (Phase 1 — auth & administration)

| Method | Path | Permission |
|---|---|---|
| POST | `/auth/login` | public (rate limited) |
| POST | `/auth/logout` | session |
| GET | `/auth/me` | session |
| POST | `/auth/change-password` | session |
| PATCH | `/profile` | session |
| GET/POST | `/users` | users.view / users.create |
| GET/PATCH | `/users/:id` | users.view / users.edit |
| POST | `/users/:id/reset-password` | users.reset_password |
| GET | `/users/:id/login-history` | users.view (or self) |
| GET/POST | `/roles` | roles.view / roles.create |
| GET/PATCH/DELETE | `/roles/:id` | roles.view / roles.edit / roles.delete |
| GET | `/permissions` | roles.view |
| GET/PATCH | `/settings` | settings.view / settings.edit |
| GET | `/audit-logs` | audit_logs.view |
| GET | `/health` (no version prefix) | public |

Later phases add module endpoints following the same pattern; this table is extended per phase.
