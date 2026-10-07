import { FileDown, Printer } from "@/components/ui/material-icons";
import type { Translator } from "@edge/i18n";
import { Button } from "@/components/ui/button";

/** PDF (Chromium) and browser-print links for a printable document. */
export function DocLinks({ t, type, id }: { t: Translator; type: string; id: string }) {
  return (
    <>
      <Button asChild variant="outline"><a href={`/api/v1/documents/${type}/${id}?format=pdf`} target="_blank" rel="noopener"><FileDown />PDF</a></Button>
      <Button asChild variant="outline"><a href={`/api/v1/documents/${type}/${id}?format=html`} target="_blank" rel="noopener"><Printer />{t("quotations.print")}</a></Button>
    </>
  );
}
