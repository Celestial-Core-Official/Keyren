import { sql } from "drizzle-orm";
import type { Database } from "@/db/types";
import type { RateLimitDimension, RateLimitResult, RateLimiter } from "./types";

/**
 * Fixed-window counters held in Postgres.
 *
 * Chosen over Redis because Alpha_v1 does not justify another dependency, and
 * over in-memory counters because a serverless deployment spreads requests
 * across instances that would each keep their own count — an attacker would
 * simply get N times the intended limit.
 *
 * Fixed windows admit up to 2x the limit across a window boundary. That is an
 * accepted trade for Alpha_v1: this class sits behind the RateLimiter
 * interface, so a sliding window or a token bucket can replace it without the
 * verification path changing.
 */
export class PostgresRateLimiter implements RateLimiter {
  constructor(private readonly db: Database) {}

  async consume(dimensions: RateLimitDimension[]): Promise<RateLimitResult> {
    if (dimensions.length === 0) return { allowed: true };

    const now = Date.now();

    for (const dimension of dimensions) {
      const windowMs = dimension.windowSeconds * 1000;
      const windowStartMs = Math.floor(now / windowMs) * windowMs;
      const bucketKey = `${dimension.name}:${dimension.value}:${windowStartMs}`;

      let count: number;
      try {
        // A single atomic upsert-and-increment. Doing this as SELECT then
        // UPDATE would let concurrent requests read the same count and each
        // decide they were under the limit.
        const result = await this.db.execute<{ count: number }>(sql`
          INSERT INTO rate_limit_counters (bucket_key, window_start, count)
          VALUES (${bucketKey}, ${new Date(windowStartMs)}, 1)
          ON CONFLICT (bucket_key)
          DO UPDATE SET count = rate_limit_counters.count + 1
          RETURNING count
        `);

        // `db.execute()`'s resolved type is `unknown` for every driver, by
        // construction — `Database` is written against the abstract
        // PgQueryResultHKT rather than a concrete driver HKT (see
        // PROGRESS.md). Runtime shape also differs: postgres.js resolves to
        // an array-like, PGlite resolves to `{ rows, fields, affectedRows }`.
        // Handle both explicitly rather than assuming either.
        const rows = Array.isArray(result)
          ? result
          : ((result as { rows?: unknown[] }).rows ?? []);
        const first = rows[0] as { count: number | string } | undefined;
        count = Number(first?.count ?? 0);
      } catch {
        // Fail open. An unavailable limiter must not take licensing offline.
        // Deliberately does not log the bucket key, which contains an IP.
        return { allowed: true };
      }

      if (count > dimension.limit) {
        const retryAfterSeconds = Math.max(
          1,
          Math.ceil((windowStartMs + windowMs - now) / 1000),
        );
        return { allowed: false, retryAfterSeconds };
      }
    }

    return { allowed: true };
  }
}
