import { z } from "zod";

export const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(100).optional(),
  sort: z.string().max(50).optional(),
  order: z.enum(["asc", "desc"]).default("desc"),
});

export type ListQuery = z.infer<typeof listQuerySchema>;

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

export function pageArgs(q: ListQuery) {
  return { skip: (q.page - 1) * q.pageSize, take: q.pageSize };
}

export function toPage<T>(items: T[], total: number, q: ListQuery): Page<T> {
  return { items, total, page: q.page, pageSize: q.pageSize, pageCount: Math.max(1, Math.ceil(total / q.pageSize)) };
}

/** Only allow sorting by whitelisted fields (prevents arbitrary column probing). */
export function orderBy(q: ListQuery, allowed: readonly string[], fallback: string) {
  const field = q.sort && allowed.includes(q.sort) ? q.sort : fallback;
  return { [field]: q.order };
}
