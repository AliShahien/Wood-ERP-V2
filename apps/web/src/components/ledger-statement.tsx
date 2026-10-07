import type { Locale, Translator } from "@edge/i18n";
import { formatDate, formatNumber } from "@edge/i18n";
import { Card, CardHeader, CardTitle, Num, Table, Td, Th, Tr } from "@/components/ui/primitives";

type Row = { id: string; entryDate: Date; documentType: string; documentNumber: string; debit: unknown; credit: unknown; balance: unknown; description: string | null };

/** Receivable/payable statement with running balance (from immutable ledger rows). */
export function LedgerStatement({ t, locale, rows, title }: { t: Translator; locale: Locale; rows: Row[]; title: string }) {
  if (!rows.length) return null;
  const last = rows.slice(-50);
  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <Table>
        <thead><tr className="border-b"><Th>{t("audit.time")}</Th><Th>{t("inventory.reference")}</Th><Th>{t("fields.description")}</Th><Th className="text-end">{t("reports.debit")}</Th><Th className="text-end">{t("reports.credit")}</Th><Th className="text-end">{t("fields.balance")}</Th></tr></thead>
        <tbody>
          {last.map((r) => (
            <Tr key={r.id}>
              <Td><Num>{formatDate(locale, r.entryDate)}</Num></Td>
              <Td><Num>{r.documentNumber}</Num> <span className="text-xs text-muted-foreground">{t(`reports.docType.${r.documentType}`)}</span></Td>
              <Td className="text-muted-foreground">{r.description ?? ""}</Td>
              <Td className="text-end"><Num>{Number(r.debit) ? formatNumber(locale, Number(r.debit)) : ""}</Num></Td>
              <Td className="text-end"><Num>{Number(r.credit) ? formatNumber(locale, Number(r.credit)) : ""}</Num></Td>
              <Td className="text-end font-medium"><Num>{formatNumber(locale, Number(r.balance))}</Num></Td>
            </Tr>
          ))}
        </tbody>
      </Table>
    </Card>
  );
}
