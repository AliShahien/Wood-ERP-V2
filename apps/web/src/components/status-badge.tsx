import type { Translator } from "@edge/i18n";
import { Badge } from "@/components/ui/primitives";

type Tone = "neutral" | "success" | "warning" | "danger" | "info";

const TONES: Record<string, Tone> = {
  ACTIVE: "success", INACTIVE: "neutral", DRAFT: "neutral", SUBMITTED: "info", APPROVED: "success", REJECTED: "danger",
  EXPIRED: "neutral", CONVERTED: "info", CANCELLED: "danger", POSTED: "success", REVERSED: "danger",
  CONFIRMED: "info", IN_PRODUCTION: "warning", READY: "success", PARTIALLY_DELIVERED: "warning", DELIVERED: "success", CLOSED: "neutral",
  WAITING_MATERIALS: "warning", MATERIALS_ISSUED: "info", QUALITY_CHECK: "warning", COMPLETED: "success",
  PENDING: "neutral", IN_PROGRESS: "warning", SKIPPED: "neutral", SCHEDULED: "info",
  PASSED: "success", FAILED: "danger", PASSED_WITH_NOTES: "warning",
  PARTIALLY_PAID: "warning", PAID: "success", PARTIALLY_RECEIVED: "warning", RECEIVED: "success", ORDERED: "info",
  ARCHIVED: "neutral", LOW: "neutral", NORMAL: "info", HIGH: "warning", URGENT: "danger",
};

/** `group` is the enum name used in the i18n key: status.<group>.<value>. */
export function StatusBadge({ t, group, value }: { t: Translator; group: string; value: string }) {
  return <Badge tone={TONES[value] ?? "neutral"}>{t(`status.${group}.${value}`)}</Badge>;
}
