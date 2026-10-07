# Final acceptance test (spec §86) — status 2026-09-25

✅ verified by automated test / smoke run · 🟡 implemented, needs the owner's environment · ⬜ not done

| # | Item | Status | Evidence |
|---|---|---|---|
| 1 | Create user | ✅ | auth.test.ts, smoke security |
| 2 | Create role | ✅ | auth.test.ts (custom roles) |
| 3 | Assign permissions | ✅ | auth.test.ts, roles permission matrix UI |
| 4 | Create showroom | ✅ | smoke security / phase2 |
| 5 | Create customer | ✅ | master-data.test.ts, Playwright (UI) |
| 6 | Create supplier | ✅ | purchasing.test.ts, smoke phase5 |
| 7 | Create product | ✅ | master-data.test.ts |
| 8 | Upload product images | ✅ | master-data.test.ts, smoke phase2 (multipart, spoofed file rejected) |
| 9 | Create materials | ✅ | master-data.test.ts (Arabic names) |
| 10 | Create warehouse | ✅ | seed + UI; smoke phase2 |
| 11 | Create BOM | ✅ | manufacturing.test.ts, smoke phase4 |
| 12 | Create quotation | ✅ | sales.test.ts |
| 13 | Add measurements | ✅ | manufacturing.test.ts (versions), full-flow.test.ts |
| 14 | Approve quotation | ✅ | sales.test.ts |
| 15 | Create sales order | ✅ | sales.test.ts (+ concurrency) |
| 16 | Create manufacturing order | ✅ | full-flow.test.ts |
| 17 | Calculate materials | ✅ | BOM calc test (formula, waste, conditions) |
| 18 | Check stock | ✅ | WAITING_MATERIALS test |
| 19 | Issue materials | ✅ | full-flow.test.ts |
| 20 | Verify stock deduction | ✅ | full-flow.test.ts (exact 8 m²) |
| 21 | Start production | ✅ | full-flow.test.ts |
| 22 | Complete production | ✅ | full-flow.test.ts |
| 23 | Perform QC | ✅ | manufacturing.test.ts (fail → rework → pass) |
| 24 | Create delivery | ✅ | full-flow.test.ts, smoke phase7 |
| 25 | Complete delivery | ✅ | partial + full delivery, signature |
| 26 | Create invoice | ✅ | full-flow.test.ts |
| 27 | Receive customer payment | ✅ | full-flow.test.ts (deposit + balance) |
| 28 | Verify customer balance | ✅ | balance = 0 from ledger |
| 29 | Record purchase | ✅ | purchasing.test.ts |
| 30 | Receive materials | ✅ | partial/full receipts |
| 31 | Verify inventory increase | ✅ | purchasing.test.ts, moving average |
| 32 | Record supplier invoice | ✅ | purchasing.test.ts |
| 33 | Record supplier payment | ✅ | purchasing.test.ts (+ reversal) |
| 34 | Verify supplier balance | ✅ | balance = 0 from ledger |
| 35 | Verify costing | ✅ | costVariance in full-flow (actual material 1,600) |
| 36 | Verify dashboards | ✅ | platform-services.test.ts, smoke phase8, visual AR/EN |
| 37 | Verify reports | ✅ | finance.test.ts (all 19 run), smoke phase6 (CSV/XLSX/PDF) |
| 38 | Verify audit logs | ✅ | full-flow.test.ts (key actions), immutability test |
| 39 | Test Arabic | ✅ | Playwright, Arabic PDF visual check |
| 40 | Test English | ✅ | Playwright |
| 41 | Test RTL | ✅ | Playwright (dir + sidebar position) |
| 42 | Test LTR | ✅ | Playwright |
| 43 | Test permissions | ✅ | auth/master-data/finance tests, smoke security |
| 44 | Test unauthorized requests | ✅ | smoke security (401/403/404/CSRF) |
| 45 | Test concurrent inventory transactions | ✅ | 10 / 8 vs 5 test |
| 46 | Test backup | ✅ | restore-test |
| 47 | Test restore | ✅ | restore-test (checksums) — repeat on production data before go-live |
| 48 | Test production build | ✅ | `npm run build` + production-mode server smoke |
| 49 | Test deployment configuration | 🟡 | Dockerfile/compose/Caddy written; image build and Hostinger/Supabase deployment need the owner's VPS + Supabase project |

## Remaining before go-live (require the owner)
1. Buy the Hostinger VPS, create the Supabase project, fill `.env` (see ENVIRONMENT.md).
2. On the VPS: `docker compose -f docker/docker-compose.prod.yml up -d --build`, `db:deploy`, `db:seed` (demo data OFF), `storage:init`.
3. Upload a product image and an attachment to verify the Supabase Storage driver.
4. Configure stage labor rates, company info, tax defaults, cash/bank accounts, opening stock balances.
5. Run the restore test against production data into a staging database; record it in BACKUP.md.
6. Confirm the open business decisions in BUSINESS_RULES.md (deposit gate, costing method, pricing model).
