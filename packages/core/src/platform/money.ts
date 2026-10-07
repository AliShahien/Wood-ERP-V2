import { Prisma } from "@edge/db";

/** Exact decimal arithmetic for money and quantities (never JS floats). */
export type Dec = Prisma.Decimal;
type DecInput = Prisma.Decimal | number | string;
export const D = (v: DecInput | null | undefined): Dec => new Prisma.Decimal(v ?? 0);
export const ZERO = D(0);

export const money = (v: Dec) => v.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
export const qty4 = (v: Dec) => v.toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);
export const sum = (values: Dec[]) => values.reduce((a, b) => a.plus(b), ZERO);
