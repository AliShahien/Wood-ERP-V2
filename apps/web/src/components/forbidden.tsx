import { ShieldAlert } from "@/components/ui/material-icons";
import type { Translator } from "@edge/i18n";
import { Card } from "@/components/ui/primitives";

export function Forbidden({ t }: { t: Translator }) {
  return (
    <Card className="mx-auto mt-10 flex max-w-md flex-col items-center gap-3 p-10 text-center">
      <ShieldAlert className="size-8 text-destructive" />
      <p className="font-medium">{t("errors.forbidden")}</p>
    </Card>
  );
}
