import "server-only";

/**
 * Fixed-window in-memory rate limiter (per process).
 * Adequate for a single app instance (Hostinger VPS / Node app). When running several
 * instances behind a load balancer, move the counters to PostgreSQL or Redis.
 */
const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    if (buckets.size > 50_000) for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
    return true;
  }
  b.count++;
  return b.count <= limit;
}
