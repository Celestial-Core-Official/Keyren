import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { createTestDatabase } from "./db";
import type { Database } from "@/db/types";

let db: Database;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDatabase());
});
afterAll(async () => {
  await close();
});

describe("PGlite harness", () => {
  it("creates every table from the real migrations", async () => {
    // `Database` is written against the driver-agnostic `PgQueryResultHKT`
    // base (see src/db/types.ts), so `db.execute()`'s resolved type is
    // `unknown` at the type level regardless of the `<TRow>` generic — the
    // base HKT declares `type` as `unknown` and only a *concrete* HKT (e.g.
    // Pglite's, which redefines `type` as `Results<Row>`) would narrow it.
    // Empirically confirmed under PGlite 0.5.4 / drizzle-orm 0.45.2: at
    // runtime the resolved value is a plain PGlite `Results` object
    // `{ rows, fields, affectedRows }`, not an iterable — `[...result]`
    // throws "result is not iterable". This assertion documents that actual
    // shape rather than guessing; it is not a widening to `any`.
    const result = (await db.execute<{ table_name: string }>(
      sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`,
    )) as { rows: { table_name: string }[] };
    const names = result.rows.map((row) => row.table_name);
    for (const table of ["products", "licenses", "activations", "rate_limit_counters"]) {
      expect(names).toContain(table);
    }
  });

  it("enforces the foreign key from licenses to products", async () => {
    await expect(
      db.execute(
        sql`INSERT INTO licenses (id, product_id, key_hash, key_last4)
            VALUES ('lic_x', 'prod_does_not_exist', 'hash', 'WXYZ')`,
      ),
    ).rejects.toThrow();
  });
});
