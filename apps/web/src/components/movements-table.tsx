import type { Translator } from "@edge/i18n";
import { formatDate, formatNumber, type Locale } from "@edge/i18n";
import { Num, Table, Td, Th, Tr } from "@/components/ui/primitives";

type Row = {
  id: string; type: string; quantity: unknown; unitCost: unknown; totalCost: unknown; balanceAfter: unknown; referenceNumber: string; transactionDate: Date;
  material: { code: string; name: string; unit: { name: string } }; warehouse: { name: string }; notes: string | null;
};

export function MovementsTable({ t, locale, rows, showMaterial = true }: { t: Translator; locale: Locale; rows: Row[]; showMaterial?: boolean }) {
  const cost = rows.some((r) => r.unitCost !== null);
  return (
    <Table>
      <thead><tr className="border-b">
        <Th>{t("audit.time")}</Th>{showMaterial ? <Th>{t("docs.material")}</Th> : null}<Th>{t("nav.warehouses")}</Th><Th>{t("inventory.type")}</Th><Th>{t("inventory.reference")}</Th>
        <Th className="text-end">{t("docs.qty")}</Th><Th className="text-end">{t("inventory.balanceAfter")}</Th>{cost ? <><Th className="text-end">{t("inventory.unitCost")}</Th><Th className="text-end">{t("inventory.value")}</Th></> : null}
      </tr></thead>
      <tbody>
        {rows.map((r) => {
          const q = Number(r.quantity);
          return (
            <Tr key={r.id}>
              <Td><Num>{formatDate(locale, r.transactionDate, true)}</Num></Td>
              {showMaterial ? <Td>{r.material.name} <Num className="text-xs text-muted-foreground">{r.material.code}</Num></Td> : null}
              <Td>{r.warehouse.name}</Td>
              <Td>{t(`status.InventoryTxType.${r.type}`)}</Td>
              <Td><Num>{r.referenceNumber}</Num></Td>
              <Td className="text-end"><Num className={q < 0 ? "text-destructive" : "text-success"}>{q > 0 ? "+" : ""}{formatNumber(locale, q, 3)}</Num></Td>
              <Td className="text-end"><Num>{formatNumber(locale, Number(r.balanceAfter), 3)}</Num></Td>
              {cost ? <><Td className="text-end"><Num>{formatNumber(locale, Number(r.unitCost), 4)}</Num></Td><Td className="text-end"><Num>{formatNumber(locale, Number(r.totalCost))}</Num></Td></> : null}
            </Tr>
          );
        })}
      </tbody>
    </Table>
  );
}
