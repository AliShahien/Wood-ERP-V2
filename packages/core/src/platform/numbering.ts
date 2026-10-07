import type { Tx } from "@edge/db";

/**
 * Document numbering. `yearly` sequences reset each year: QT-2026-000001.
 * Global sequences: CUS-000001.
 */
export const SEQUENCES = {
  CUSTOMER: { prefix: "CUS", yearly: false },
  SUPPLIER: { prefix: "SUP", yearly: false },
  USER: { prefix: "EMP", yearly: false },
  PRODUCT: { prefix: "DR", yearly: false },
  MATERIAL: { prefix: "MAT", yearly: false },
  QUOTATION: { prefix: "QT", yearly: true },
  SALES_ORDER: { prefix: "SO", yearly: true },
  MEASUREMENT: { prefix: "MEA", yearly: true },
  MANUFACTURING_ORDER: { prefix: "MO", yearly: true },
  MATERIAL_ISSUE: { prefix: "MI", yearly: true },
  MATERIAL_RETURN: { prefix: "MR", yearly: true },
  QUALITY_CHECK: { prefix: "QC", yearly: true },
  PURCHASE_REQUEST: { prefix: "PR", yearly: true },
  PURCHASE_ORDER: { prefix: "PO", yearly: true },
  GOODS_RECEIPT: { prefix: "GRN", yearly: true },
  SUPPLIER_INVOICE: { prefix: "SINV", yearly: true },
  SUPPLIER_PAYMENT: { prefix: "SPAY", yearly: true },
  STOCK_TRANSFER: { prefix: "TRF", yearly: true },
  STOCK_ADJUSTMENT: { prefix: "ADJ", yearly: true },
  DELIVERY: { prefix: "DLV", yearly: true },
  INVOICE: { prefix: "INV", yearly: true },
  PAYMENT: { prefix: "PAY", yearly: true },
  EXPENSE: { prefix: "EXP", yearly: true },
} as const;

export type SequenceName = keyof typeof SEQUENCES;

export function formatNumber(prefix: string, period: number, value: number): string {
  const serial = String(value).padStart(6, "0");
  return period > 0 ? `${prefix}-${period}-${serial}` : `${prefix}-${serial}`;
}

/**
 * Allocates the next number INSIDE the caller's transaction.
 * `INSERT .. ON CONFLICT DO UPDATE .. RETURNING` takes a row lock on the sequence row, so
 * concurrent transactions serialize on it and every number is unique and gap-free
 * (a rolled-back transaction also rolls back its increment).
 */
export async function nextNumber(tx: Tx, name: SequenceName, date: Date = new Date()): Promise<string> {
  const { prefix, yearly } = SEQUENCES[name];
  const period = yearly ? date.getUTCFullYear() : 0;
  const rows = await tx.$queryRaw<{ last_value: number }[]>`
    INSERT INTO document_sequences (key, period, last_value, updated_at)
    VALUES (${prefix}, ${period}, 1, now())
    ON CONFLICT (key, period)
    DO UPDATE SET last_value = document_sequences.last_value + 1, updated_at = now()
    RETURNING last_value`;
  const value = rows[0]?.last_value;
  if (value === undefined) throw new Error(`Failed to allocate number for ${name}`);
  return formatNumber(prefix, period, Number(value));
}
