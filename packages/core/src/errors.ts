export type ErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION"
  | "CONFLICT"
  | "INVALID_TRANSITION"
  | "INSUFFICIENT_STOCK"
  | "IMMUTABLE"
  | "RATE_LIMITED"
  | "INTERNAL";

const HTTP_STATUS: Record<ErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION: 422,
  CONFLICT: 409,
  INVALID_TRANSITION: 409,
  INSUFFICIENT_STOCK: 409,
  IMMUTABLE: 409,
  RATE_LIMITED: 429,
  INTERNAL: 500,
};

/**
 * Domain error. `messageKey` is an i18n key (errors.*) so the UI can show a translated
 * message; `details` carries structured context (field errors, shortages ...).
 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly messageKey: string;
  readonly details?: unknown;

  constructor(code: ErrorCode, messageKey: string, details?: unknown, message?: string) {
    super(message ?? messageKey);
    this.name = "AppError";
    this.code = code;
    this.messageKey = messageKey;
    this.details = details;
  }

  get status(): number {
    return HTTP_STATUS[this.code];
  }
}

export const notFound = (entity: string) => new AppError("NOT_FOUND", "errors.notFound", { entity });
export const forbidden = (permission?: string) =>
  new AppError("FORBIDDEN", "errors.forbidden", permission ? { permission } : undefined);
export const conflict = (messageKey: string, details?: unknown) => new AppError("CONFLICT", messageKey, details);
export const validation = (messageKey: string, details?: unknown) => new AppError("VALIDATION", messageKey, details);

/** Maps PostgreSQL / Prisma errors to domain errors. */
export function mapDbError(err: unknown): unknown {
  const e = err as { code?: string; message?: string; meta?: { target?: unknown; cause?: string } };
  const msg = `${e?.message ?? ""} ${e?.meta?.cause ?? ""}`;
  if (e?.code === "P2002") return new AppError("CONFLICT", "errors.duplicate", { target: e.meta?.target });
  if (e?.code === "P2025") return new AppError("NOT_FOUND", "errors.notFound");
  // Malformed UUID in a path/body → treat as "not found" instead of a server error.
  if (msg.includes("invalid input syntax for type uuid") || msg.includes("Error creating UUID")) return new AppError("NOT_FOUND", "errors.notFound");
  if (msg.includes("EDGE_IMMUTABLE")) return new AppError("IMMUTABLE", "errors.immutable");
  if (msg.includes("inventory_balances_qty_nonneg")) return new AppError("INSUFFICIENT_STOCK", "errors.insufficientStock");
  return err;
}
