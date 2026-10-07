import { AppError } from "../errors";

export type Transitions<S extends string> = Readonly<Record<S, readonly S[]>>;

/** Server-side status transition validation. No status may change outside these maps. */
export function assertTransition<S extends string>(entity: string, map: Transitions<S>, from: S, to: S): void {
  if (!map[from]?.includes(to)) {
    throw new AppError("INVALID_TRANSITION", "errors.invalidTransition", { entity, from, to });
  }
}

export const QUOTATION_TRANSITIONS: Transitions<
  "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED" | "EXPIRED" | "CONVERTED" | "CANCELLED"
> = {
  DRAFT: ["SUBMITTED", "CANCELLED"],
  SUBMITTED: ["APPROVED", "REJECTED", "DRAFT", "CANCELLED"],
  APPROVED: ["CONVERTED", "EXPIRED", "CANCELLED"],
  REJECTED: [],
  EXPIRED: [],
  CONVERTED: [],
  CANCELLED: [],
};

export const MANUFACTURING_TRANSITIONS: Transitions<
  | "DRAFT"
  | "APPROVED"
  | "WAITING_MATERIALS"
  | "MATERIALS_ISSUED"
  | "IN_PRODUCTION"
  | "QUALITY_CHECK"
  | "COMPLETED"
  | "CANCELLED"
> = {
  DRAFT: ["APPROVED", "CANCELLED"],
  APPROVED: ["WAITING_MATERIALS", "MATERIALS_ISSUED", "CANCELLED"],
  WAITING_MATERIALS: ["MATERIALS_ISSUED", "CANCELLED"],
  MATERIALS_ISSUED: ["IN_PRODUCTION", "CANCELLED"],
  IN_PRODUCTION: ["QUALITY_CHECK"],
  // QC failure sends the order back to production (rework).
  QUALITY_CHECK: ["COMPLETED", "IN_PRODUCTION"],
  COMPLETED: [],
  CANCELLED: [],
};

export const SALES_ORDER_TRANSITIONS: Transitions<
  "CONFIRMED" | "IN_PRODUCTION" | "READY" | "PARTIALLY_DELIVERED" | "DELIVERED" | "CLOSED" | "CANCELLED"
> = {
  CONFIRMED: ["IN_PRODUCTION", "CANCELLED"],
  IN_PRODUCTION: ["READY", "PARTIALLY_DELIVERED"],
  READY: ["PARTIALLY_DELIVERED", "DELIVERED"],
  PARTIALLY_DELIVERED: ["DELIVERED"],
  DELIVERED: ["CLOSED"],
  CLOSED: [],
  CANCELLED: [],
};

export const PURCHASE_ORDER_TRANSITIONS: Transitions<
  "DRAFT" | "SUBMITTED" | "APPROVED" | "PARTIALLY_RECEIVED" | "RECEIVED" | "CLOSED" | "CANCELLED"
> = {
  DRAFT: ["SUBMITTED", "CANCELLED"],
  SUBMITTED: ["APPROVED", "DRAFT", "CANCELLED"],
  APPROVED: ["PARTIALLY_RECEIVED", "RECEIVED", "CANCELLED"],
  PARTIALLY_RECEIVED: ["PARTIALLY_RECEIVED", "RECEIVED", "CLOSED"],
  RECEIVED: ["CLOSED"],
  CLOSED: [],
  CANCELLED: [],
};

export const DELIVERY_TRANSITIONS: Transitions<
  "PENDING" | "SCHEDULED" | "DELIVERED" | "PARTIALLY_DELIVERED" | "CANCELLED"
> = {
  PENDING: ["SCHEDULED", "DELIVERED", "PARTIALLY_DELIVERED", "CANCELLED"],
  SCHEDULED: ["DELIVERED", "PARTIALLY_DELIVERED", "PENDING", "CANCELLED"],
  PARTIALLY_DELIVERED: [],
  DELIVERED: [],
  CANCELLED: [],
};
