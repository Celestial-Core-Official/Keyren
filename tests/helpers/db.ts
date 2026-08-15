import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { sql } from "drizzle-orm";
import * as schema from "@/db/schema";
import type { Database } from "@/db/types";

/**
 * A real Postgres, compiled to WASM, held in memory.
 *
 * This runs the actual migrations against the actual engine, so foreign keys,
 * unique indexes and enum constraints are all genuinely exercised — a mocked
 * repository would let a broken constraint pass silently. It needs no Docker,
 * no local Postgres, and no network.
 */
export async function createTestDatabase(): Promise<{
  db: Database;
  close: () => Promise<void>;
}> {
  const client = new PGlite();
  const db = drizzle(client, { schema }) as unknown as Database;

  await migrate(db as never, { migrationsFolder: "./drizzle" });

  return {
    db,
    close: async () => {
      await client.close();
    },
  };
}

/** Wipes all rows between tests without paying to rebuild the schema. */
export async function truncateAll(db: Database): Promise<void> {
  await db.execute(
    sql`TRUNCATE TABLE activations, licenses, products, rate_limit_counters RESTART IDENTITY CASCADE`,
  );
}

/** The secret used by every test. Never a real one. */
export const TEST_HMAC_SECRET = "test-hmac-secret-value-at-least-32-chars-long";
