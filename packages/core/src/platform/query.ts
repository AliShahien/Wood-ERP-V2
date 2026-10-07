/** Case-insensitive OR search across fields. Returns {} when q is empty. */
export function searchWhere(q: string | undefined, fields: string[], exactFields: string[] = []) {
  if (!q) return {};
  return {
    OR: [
      ...fields.map((f) => ({ [f]: { contains: q, mode: "insensitive" as const } })),
      ...exactFields.map((f) => ({ [f]: { contains: q } })),
    ],
  };
}

/** Converts Prisma Decimal/Date/BigInt into JSON-safe values (for passing to client components). */
export function plain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value, (_k, v) => (typeof v === "bigint" ? v.toString() : v)));
}

/** Rounds money to 2 decimals (half away from zero) using integer math on cents. */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function round4(n: number): number {
  return Math.round((n + Number.EPSILON) * 10000) / 10000;
}
