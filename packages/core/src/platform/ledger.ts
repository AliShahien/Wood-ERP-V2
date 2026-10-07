import type { Tx } from "@edge/db";
import type { ServiceContext } from "../context";
import { D, type Dec } from "./money";

type LedgerDocType =
  | "OPENING_BALANCE" | "CUSTOMER_INVOICE" | "CUSTOMER_PAYMENT" | "CREDIT_NOTE" | "SUPPLIER_INVOICE"
  | "SUPPLIER_PAYMENT" | "DEBIT_NOTE" | "ADJUSTMENT" | "REVERSAL";

/**
 * Receivables/payables sub-ledger posting. Rows are immutable (DB trigger).
 * Customer: invoice = debit, payment = credit. Supplier: invoice = credit, payment = debit.
 */
export async function postLedger(
  tx: Tx,
  ctx: Pick<ServiceContext, "actor">,
  e: {
    party: { customerId: string } | { supplierId: string };
    date: Date;
    documentType: LedgerDocType;
    documentId: string;
    documentNumber: string;
    debit?: Dec | number;
    credit?: Dec | number;
    description?: string;
  },
) {
  const isCustomer = "customerId" in e.party;
  return tx.partyLedgerEntry.create({
    data: {
      partyType: isCustomer ? "CUSTOMER" : "SUPPLIER",
      customerId: isCustomer ? (e.party as { customerId: string }).customerId : null,
      supplierId: isCustomer ? null : (e.party as { supplierId: string }).supplierId,
      entryDate: e.date,
      documentType: e.documentType,
      documentId: e.documentId,
      documentNumber: e.documentNumber,
      debit: D(e.debit ?? 0),
      credit: D(e.credit ?? 0),
      description: e.description ?? null,
      createdById: ctx.actor.userId,
    },
  });
}

/** Posts the mirror entry of every ledger row of a document (debit↔credit). */
export async function reverseLedger(tx: Tx, ctx: Pick<ServiceContext, "actor">, documentId: string, description: string) {
  const rows = await tx.partyLedgerEntry.findMany({ where: { documentId, reversalOfId: null, reversedBy: null, NOT: { documentType: "REVERSAL" } } });
  for (const r of rows) {
    await tx.partyLedgerEntry.create({
      data: {
        partyType: r.partyType, customerId: r.customerId, supplierId: r.supplierId, entryDate: new Date(),
        documentType: "REVERSAL", documentId: r.documentId, documentNumber: r.documentNumber,
        debit: r.credit, credit: r.debit, description, reversalOfId: r.id, createdById: ctx.actor.userId,
      },
    });
  }
}

export async function postCash(
  tx: Tx,
  ctx: Pick<ServiceContext, "actor">,
  e: { cashAccountId: string; date: Date; direction: "IN" | "OUT"; amount: Dec | number; sourceType: string; sourceId: string; sourceNumber: string; description?: string },
) {
  return tx.cashTransaction.create({
    data: {
      cashAccountId: e.cashAccountId, txDate: e.date, direction: e.direction, amount: D(e.amount),
      sourceType: e.sourceType, sourceId: e.sourceId, sourceNumber: e.sourceNumber, description: e.description ?? null,
      createdById: ctx.actor.userId,
    },
  });
}

export async function reverseCash(tx: Tx, ctx: Pick<ServiceContext, "actor">, sourceId: string, description: string) {
  const rows = await tx.cashTransaction.findMany({ where: { sourceId, reversalOfId: null, reversedBy: null } });
  for (const r of rows) {
    await tx.cashTransaction.create({
      data: {
        cashAccountId: r.cashAccountId, txDate: new Date(), direction: r.direction === "IN" ? "OUT" : "IN", amount: r.amount,
        sourceType: r.sourceType, sourceId: r.sourceId, sourceNumber: r.sourceNumber, description, reversalOfId: r.id, createdById: ctx.actor.userId,
      },
    });
  }
}
