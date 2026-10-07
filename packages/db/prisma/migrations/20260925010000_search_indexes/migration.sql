-- Trigram indexes so "contains" searches (ILIKE '%term%') stay fast at hundreds of thousands of rows.
-- Hand-written (Prisma schema does not model GIN/trgm indexes). If `prisma migrate dev` ever
-- proposes dropping these indexes, delete those statements from the generated migration.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS customers_name_trgm ON customers USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS customers_phone_trgm ON customers USING gin (phone gin_trgm_ops);
CREATE INDEX IF NOT EXISTS customers_whatsapp_trgm ON customers USING gin (whatsapp gin_trgm_ops);
CREATE INDEX IF NOT EXISTS suppliers_name_trgm ON suppliers USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS products_name_trgm ON products USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS materials_name_trgm ON materials USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS quotations_number_trgm ON quotations USING gin (number gin_trgm_ops);
CREATE INDEX IF NOT EXISTS sales_orders_number_trgm ON sales_orders USING gin (number gin_trgm_ops);
CREATE INDEX IF NOT EXISTS manufacturing_orders_number_trgm ON manufacturing_orders USING gin (number gin_trgm_ops);

-- Frequently filtered combinations.
CREATE INDEX IF NOT EXISTS inventory_tx_type_date ON inventory_transactions (type, transaction_date);
CREATE INDEX IF NOT EXISTS notifications_user_unread ON notifications (user_id) WHERE read_at IS NULL;
