# Business rules

Rules marked **[DECISION]** were chosen during implementation; confirm or change them with the business owner.

## Master data language
- Product (door) names: English, stored as entered. Material names: Arabic. Customer/supplier
  names: as entered. Units are stored in Arabic (قطعة، متر مربع …). UI labels are translated.

## Pricing (quotations)
- Unit price = product base price (per unit, or per m² × door area) + selected option adjustments
  (fixed per unit, per m², or percent of base). **[DECISION]**
- The computed price is a suggestion; changing it requires `quotations.override_price`.
- Line total = quantity × unit price − line discount. Document discount: amount or percent of subtotal.
- Total = subtotal − discount + installation + transportation + tax.

## Tax **[DECISION — per user instruction]**
- Tax is **optional per document**. Each quotation/invoice/PO has `tax_enabled` and `tax_rate`.
- Settings `finance.taxEnabledByDefault` and `finance.defaultTaxRate` only pre-fill new documents.
- Tax base = subtotal − discount + installation + transportation.
- Currency setting default: EGP (single currency).

## Deposits and payments
- `deposit_required` defaults to `sales.defaultDepositPercent` × total (informational — not enforced
  as a gate). **[DECISION]** Whether a deposit must be received before manufacturing starts is
  a business policy to confirm; currently it is shown, not enforced.
- Payments may be recorded against a sales order before an invoice exists (advance). They are
  allocated to invoices when invoices are posted.

## Inventory
- Negative stock is never allowed (`inventory.allowNegativeStock` is fixed to `false`).
- Costing method: **moving weighted average** per material (across warehouses). **[DECISION]**
  On receipt: `new_avg = (on_hand × avg + qty × unit_cost) / (on_hand + qty)`.
  Issues are costed at the current average. Returns re-enter at the cost they were issued at.
- Transfers do not change cost.

## BOM and material requirements
- Variables available to formulas: `W`, `H`, `T` (mm), `Q` (quantity), plus BOM rule keys.
  Functions: `min, max, ceil, floor, round, abs`. Evaluated by a sandboxed parser (no `eval`).
- `per_unit = true` → result × Q. Waste % applied on top: `qty × (1 + waste/100)`.
- Lines with a condition option apply only when that option is selected on the quotation line.
- The BOM version used is frozen on the MO; later BOM edits do not change existing MOs.

## Manufacturing and costing
- Estimated cost (at MO approval) = Σ requirement × current average cost + BOM labor per unit × Q
  + overhead % × (material + labor).
- Actual cost = Σ posted issue cost − returns + Σ operation labor (hours × stage rate)
  + overhead % × (actual material + actual labor) + expenses linked to the MO.
- Issuing more than required is allowed (reported as variance); issuing requires stock.
- Variance = actual − estimated (quantities per material and amounts).

## Documents
- Approved/posted documents are immutable. Corrections: cancel, reverse, new revision/version.
- Invoices, payments, goods receipts, material issues, ledger rows are never physically deleted.
