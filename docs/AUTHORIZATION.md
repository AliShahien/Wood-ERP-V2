# Authorization

## Model

- **Permission**: a key `module.action` (catalog: `packages/core/src/auth/permissions.ts`).
- **Role**: a named bundle of permissions + a **data scope** (`ALL`, `SHOWROOM`, `OWN`).
- **User**: one or more roles; optional showroom; optional warehouse assignments.
- Effective permissions = union of all active roles. Effective scope = the broadest one.
- `SUPER_ADMIN` implicitly holds every permission and `ALL` scope.

Code **never** checks role codes (except the Super Admin bypass). Every service method starts
with `requirePermission(ctx, "<key>")`. The UI hides what the user cannot do, but the backend is
the only enforcement point.

## Data scope

| Scope | Showroom-scoped documents (customers, quotations, measurements, sales orders, invoices, payments) |
|---|---|
| `ALL` | everything |
| `SHOWROOM` | records whose `showroom_id` = user's showroom |
| `OWN` | records the user created or is salesperson on |

Warehouse restriction: if a user has warehouse assignments, inventory operations (receive, issue,
transfer, adjust) are limited to those warehouses. No assignments = unrestricted (subject to permissions).

Out-of-scope single records return **404** (not 403) so their existence is not leaked.

## Sensitive data

- Cost fields (`estimated_cost`, `average_cost`, `unit_cost`, MO costs) are stripped from
  responses unless the actor has `costing.view`.
- Accounting users do not automatically get manufacturing permissions (and vice versa).
- Only a Super Admin can grant/revoke Super Admin or modify a Super Admin user.

## Session and account security

- Argon2id password hashes (19 MiB, t=2). Policy: ≥ 8 chars, letter + digit.
- Session: random 256-bit token in `httpOnly; Secure; SameSite=Lax` cookie; DB stores HMAC only.
  TTL `SESSION_TTL_HOURS` (default 12h).
- 5 failed logins → 15 min lock. All attempts go to `login_history`.
- Deactivation, role change, role permission change, password reset → all sessions of the
  affected users are revoked immediately.
- CSRF: mutating requests must carry an `Origin` header matching `APP_URL` (+ SameSite cookie).
- Rate limiting: login and API mutation endpoints.

## Default role matrix (editable by admins)

| Role | Scope | Main permissions |
|---|---|---|
| Super Admin | ALL | everything |
| Management | ALL | all business permissions, view users/roles; no user admin / settings edit |
| Showroom Manager | SHOWROOM | customers, measurements, quotations (incl. approve), sales orders, payments.create, sales dashboard |
| Showroom Employee | OWN | customers (no delete), measurements, quotations (create/edit/submit), products view |
| Production Manager | ALL | manufacturing, production, BOM, quality, material issue request, production dashboard |
| Production Employee | ALL | view manufacturing, update production operations |
| Warehouse Manager | ALL | inventory (all), materials, warehouses, material issues (post/reverse), goods receipts |
| Warehouse Employee | ALL | receive/issue/transfer, create material issues & receipts (no posting) |
| Purchasing Employee | ALL | purchases create, suppliers, supplier invoices create |
| Accountant | ALL | invoices, payments, supplier payments/invoices, expenses, cash accounts, costing, finance dashboard |
| Quality Control | ALL | quality checks |
| Delivery Employee | ALL | deliveries view/update |
| Reports User | ALL | reports view/export, management dashboard |

Existing roles are **not** overwritten by re-seeding (admins may have customised them),
except Super Admin, which is kept in sync with the full catalog.
