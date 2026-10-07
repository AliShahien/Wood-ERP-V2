import Link from "next/link";
import type { Translator } from "@edge/i18n";
import { Card } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

export type WorkflowStep = { labelKey: string; href?: string; current?: boolean; done?: boolean };

/** One shared journey, with only permitted/created records passed in as links. */
export function WorkflowPath({ t, steps }: { t: Translator; steps: WorkflowStep[] }) {
  return (
    <Card className="mb-5 px-5 py-4">
      <p className="mb-3 text-xs font-bold text-muted-foreground">{t("workflow.path")}</p>
      <ol className="flex gap-2 overflow-x-auto pb-1" aria-label={t("workflow.path")}>
        {steps.map((step, index) => {
          const body = <><span className={cn("grid size-7 shrink-0 place-items-center rounded-full bg-muted font-sans text-xs", step.done && "bg-secondary text-secondary-foreground", step.current && "bg-primary text-primary-foreground")}>{index + 1}</span><span>{t(step.labelKey)}</span></>;
          const classes = cn("flex shrink-0 items-center gap-2 rounded-full px-2 py-1 text-xs font-semibold text-muted-foreground", (step.done || step.current) && "text-primary", step.href && "hover:bg-muted");
          return <li key={`${step.labelKey}-${index}`}>{step.href ? <Link href={step.href} className={classes} aria-current={step.current ? "step" : undefined}>{body}</Link> : <span className={classes} aria-current={step.current ? "step" : undefined}>{body}</span>}</li>;
        })}
      </ol>
    </Card>
  );
}
