-- Edge Wood ERP — integrity rules that Prisma cannot express declaratively.
-- Keep this file hand-written. See docs/DATABASE.md §Integrity.

-- ───────────── CHECK constraints ─────────────

-- Stock can never be negative (last line of defence behind the service-layer lock + check).
ALTER TABLE "inventory_balances" ADD CONSTRAINT "inventory_balances_qty_nonneg" CHECK ("quantity" >= 0);
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_qty_nonzero" CHECK ("quantity" <> 0);
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_cost_nonneg" CHECK ("unit_cost" >= 0);

ALTER TABLE "purchase_order_items" ADD CONSTRAINT "po_items_qty_pos" CHECK ("quantity" > 0 AND "unit_price" >= 0 AND "discount" >= 0 AND "received_quantity" >= 0);
ALTER TABLE "purchase_request_items" ADD CONSTRAINT "pr_items_qty_pos" CHECK ("quantity" > 0);
ALTER TABLE "goods_receipt_items" ADD CONSTRAINT "gr_items_qty_pos" CHECK ("quantity" > 0 AND "unit_cost" >= 0);
ALTER TABLE "supplier_invoice_items" ADD CONSTRAINT "si_items_qty_pos" CHECK ("quantity" > 0 AND "unit_price" >= 0);
ALTER TABLE "stock_transfer_items" ADD CONSTRAINT "transfer_items_qty_pos" CHECK ("quantity" > 0);
ALTER TABLE "stock_adjustment_items" ADD CONSTRAINT "adjustment_items_qty_nonzero" CHECK ("quantity_change" <> 0);
ALTER TABLE "stock_transfers" ADD CONSTRAINT "transfer_distinct_wh" CHECK ("from_warehouse_id" <> "to_warehouse_id");

ALTER TABLE "quotation_items" ADD CONSTRAINT "quotation_items_valid" CHECK ("quantity" > 0 AND "width" > 0 AND "height" > 0 AND "unit_price" >= 0 AND "discount" >= 0);
ALTER TABLE "sales_order_items" ADD CONSTRAINT "so_items_valid" CHECK ("quantity" > 0 AND "delivered_quantity" >= 0 AND "delivered_quantity" <= "quantity" AND "invoiced_quantity" >= 0 AND "invoiced_quantity" <= "quantity");
ALTER TABLE "manufacturing_orders" ADD CONSTRAINT "mo_qty_pos" CHECK ("quantity" > 0);
ALTER TABLE "manufacturing_order_items" ADD CONSTRAINT "mo_items_valid" CHECK ("required_quantity" >= 0 AND "issued_quantity" >= 0 AND "returned_quantity" >= 0 AND "returned_quantity" <= "issued_quantity");
ALTER TABLE "material_issue_items" ADD CONSTRAINT "mi_items_qty_pos" CHECK ("quantity" > 0);
ALTER TABLE "delivery_items" ADD CONSTRAINT "delivery_items_qty_pos" CHECK ("quantity" > 0 AND "delivered_quantity" >= 0 AND "delivered_quantity" <= "quantity");
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_qty_pos" CHECK ("quantity" > 0 AND "unit_price" >= 0);
ALTER TABLE "measurement_versions" ADD CONSTRAINT "measurement_dims_pos" CHECK ("width" > 0 AND "height" > 0);

ALTER TABLE "quotations" ADD CONSTRAINT "quotations_tax_rate" CHECK ("tax_rate" >= 0 AND "tax_rate" <= 100);
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_tax_rate" CHECK ("tax_rate" >= 0 AND "tax_rate" <= 100);
ALTER TABLE "customer_invoices" ADD CONSTRAINT "customer_invoices_tax_rate" CHECK ("tax_rate" >= 0 AND "tax_rate" <= 100);
ALTER TABLE "supplier_invoices" ADD CONSTRAINT "supplier_invoices_tax_rate" CHECK ("tax_rate" >= 0 AND "tax_rate" <= 100);
ALTER TABLE "customer_invoices" ADD CONSTRAINT "customer_invoices_paid" CHECK ("paid_amount" >= 0 AND "paid_amount" <= "total");
ALTER TABLE "supplier_invoices" ADD CONSTRAINT "supplier_invoices_paid" CHECK ("paid_amount" >= 0 AND "paid_amount" <= "total");

ALTER TABLE "customer_payments" ADD CONSTRAINT "customer_payments_amount_pos" CHECK ("amount" > 0);
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_amount_pos" CHECK ("amount" > 0);
ALTER TABLE "customer_payment_allocations" ADD CONSTRAINT "allocations_amount_pos" CHECK ("amount" > 0);
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_amount_pos" CHECK ("amount" > 0);
ALTER TABLE "cash_transactions" ADD CONSTRAINT "cash_tx_amount_pos" CHECK ("amount" > 0);

ALTER TABLE "party_ledger_entries" ADD CONSTRAINT "ledger_amounts" CHECK (
  "debit" >= 0 AND "credit" >= 0 AND ("debit" = 0) <> ("credit" = 0)
);
ALTER TABLE "party_ledger_entries" ADD CONSTRAINT "ledger_party" CHECK (
  ("party_type" = 'CUSTOMER' AND "customer_id" IS NOT NULL AND "supplier_id" IS NULL) OR
  ("party_type" = 'SUPPLIER' AND "supplier_id" IS NOT NULL AND "customer_id" IS NULL)
);

ALTER TABLE "bom_items" ADD CONSTRAINT "bom_items_quantity" CHECK (
  ("quantity_type" = 'FIXED' AND "fixed_quantity" IS NOT NULL AND "fixed_quantity" > 0) OR
  ("quantity_type" = 'FORMULA' AND "formula" IS NOT NULL AND length(trim("formula")) > 0)
);
ALTER TABLE "bom_items" ADD CONSTRAINT "bom_items_waste" CHECK ("waste_percent" >= 0 AND "waste_percent" <= 100);

-- Only one ACTIVE BOM per product.
CREATE UNIQUE INDEX "bom_headers_one_active_per_product" ON "bom_headers" ("product_id") WHERE "status" = 'ACTIVE';
-- Only one main image per product.
CREATE UNIQUE INDEX "product_images_one_main" ON "product_images" ("product_id") WHERE "is_main";

-- ───────────── Immutability triggers ─────────────

CREATE OR REPLACE FUNCTION edge_block_modification() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'EDGE_IMMUTABLE: % on % is not allowed', TG_OP, TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

-- Append-only ledgers and audit trail.
CREATE TRIGGER audit_logs_immutable BEFORE UPDATE OR DELETE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION edge_block_modification();
CREATE TRIGGER inventory_transactions_immutable BEFORE UPDATE OR DELETE ON "inventory_transactions"
  FOR EACH ROW EXECUTE FUNCTION edge_block_modification();
CREATE TRIGGER party_ledger_entries_immutable BEFORE UPDATE OR DELETE ON "party_ledger_entries"
  FOR EACH ROW EXECUTE FUNCTION edge_block_modification();
CREATE TRIGGER cash_transactions_immutable BEFORE UPDATE OR DELETE ON "cash_transactions"
  FOR EACH ROW EXECUTE FUNCTION edge_block_modification();

-- Financial / posting documents are never physically deleted (cancel / reverse instead).
CREATE TRIGGER customer_payments_no_delete BEFORE DELETE ON "customer_payments"
  FOR EACH ROW EXECUTE FUNCTION edge_block_modification();
CREATE TRIGGER supplier_payments_no_delete BEFORE DELETE ON "supplier_payments"
  FOR EACH ROW EXECUTE FUNCTION edge_block_modification();
CREATE TRIGGER expenses_no_delete BEFORE DELETE ON "expenses"
  FOR EACH ROW EXECUTE FUNCTION edge_block_modification();
CREATE TRIGGER customer_payment_allocations_no_delete BEFORE DELETE ON "customer_payment_allocations"
  FOR EACH ROW EXECUTE FUNCTION edge_block_modification();

CREATE OR REPLACE FUNCTION edge_block_delete_unless_draft() RETURNS trigger AS $$
BEGIN
  IF OLD.status::text <> 'DRAFT' THEN
    RAISE EXCEPTION 'EDGE_IMMUTABLE: cannot delete % row in status %', TG_TABLE_NAME, OLD.status;
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER customer_invoices_no_delete BEFORE DELETE ON "customer_invoices"
  FOR EACH ROW EXECUTE FUNCTION edge_block_delete_unless_draft();
CREATE TRIGGER supplier_invoices_no_delete BEFORE DELETE ON "supplier_invoices"
  FOR EACH ROW EXECUTE FUNCTION edge_block_delete_unless_draft();
CREATE TRIGGER goods_receipts_no_delete BEFORE DELETE ON "goods_receipts"
  FOR EACH ROW EXECUTE FUNCTION edge_block_delete_unless_draft();
CREATE TRIGGER material_issues_no_delete BEFORE DELETE ON "material_issues"
  FOR EACH ROW EXECUTE FUNCTION edge_block_delete_unless_draft();
CREATE TRIGGER stock_transfers_no_delete BEFORE DELETE ON "stock_transfers"
  FOR EACH ROW EXECUTE FUNCTION edge_block_delete_unless_draft();
CREATE TRIGGER stock_adjustments_no_delete BEFORE DELETE ON "stock_adjustments"
  FOR EACH ROW EXECUTE FUNCTION edge_block_delete_unless_draft();
CREATE TRIGGER quotations_no_delete BEFORE DELETE ON "quotations"
  FOR EACH ROW EXECUTE FUNCTION edge_block_delete_unless_draft();

-- Approved measurement versions are frozen. A new version must be created instead.
CREATE OR REPLACE FUNCTION edge_measurement_version_guard() RETURNS trigger AS $$
BEGIN
  IF OLD.approved_at IS NOT NULL THEN
    RAISE EXCEPTION 'EDGE_IMMUTABLE: approved measurement version cannot be changed';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER measurement_versions_guard BEFORE UPDATE OR DELETE ON "measurement_versions"
  FOR EACH ROW EXECUTE FUNCTION edge_measurement_version_guard();

-- ───────────── Row Level Security (Supabase hardening) ─────────────
-- The application connects as the table owner through the server-side API and enforces
-- authorization + data scope in the service layer (docs/AUTHORIZATION.md).
-- RLS is ENABLED with NO policies so that Supabase's public PostgREST roles
-- (anon, authenticated) can never read or write business tables directly,
-- even if the anon key leaks. The owner role bypasses RLS (not FORCEd).
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon';
    EXECUTE 'REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM authenticated';
    EXECUTE 'REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM authenticated';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM authenticated';
  END IF;
END $$;
