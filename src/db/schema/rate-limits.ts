import { index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Fixed-window counters for the public verification endpoint.
 *
 * Postgres rather than Redis: Keyren does not yet justify another piece of
 * infrastructure, and a serverless deployment cannot rely on in-process
 * memory because each instance would keep its own counter. This table is
 * hidden behind the RateLimiter interface so it can be replaced without the
 * verification path noticing.
 */
export const rateLimitCounters = pgTable(
  "rate_limit_counters",
  {
    /** "<dimension>:<value>:<window_epoch_minute>" */
    bucketKey: text("bucket_key").primaryKey(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    count: integer("count").notNull().default(0),
  },
  (table) => [
    // Supports cheap deletion of expired windows.
    index("rate_limit_window_idx").on(table.windowStart),
  ],
);
