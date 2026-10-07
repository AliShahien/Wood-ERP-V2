import { z } from "zod";
import { AppError } from "./errors";

/** Parses input with a zod schema and converts failures to a VALIDATION AppError with field paths. */
export function parse<S extends z.ZodType>(schema: S, input: unknown): z.infer<S> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new AppError(
      "VALIDATION",
      "errors.validation",
      result.error.issues.map((i) => ({ path: i.path.join("."), code: i.code, message: i.message })),
    );
  }
  return result.data;
}

export const optionalText = (max = 500) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

export const requiredText = (max = 200) => z.string().trim().min(1).max(max);
export const phone = z
  .string()
  .trim()
  .max(30)
  .regex(/^[+\d][\d\s-]{3,29}$/)
  .optional()
  .nullable()
  .or(z.literal("").transform(() => null));
export const email = z.string().trim().toLowerCase().email().max(200).optional().nullable().or(z.literal("").transform(() => null));
export const uuid = z.string().uuid();
export const recordStatus = z.enum(["ACTIVE", "INACTIVE"]);
