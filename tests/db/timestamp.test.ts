import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray, sql } from "drizzle-orm";
import { activations, licenses, applications } from "@/db/schema";
import { instant } from "@/lib/db/timestamp";
import { createTestDatabase } from "../helpers/db";
import type { Database } from "@/db/types";

let db: Database;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDatabase());
});
afterAll(async () => {
  await close();
});

const NOW = new Date("2026-08-15T12:00:00.000Z");

/**
 * The one class of bug the rest of the suite structurally cannot catch.
 *
 * Every other test runs against PGlite, which accepts a JavaScript `Date` as a
 * bound parameter. **postgres.js, the production driver, does not** — it
 * throws `ERR_INVALID_ARG_TYPE`. So a raw `sql` template that interpolates a
 * `Date` passes every test and then fails on the first production request.
 *
 * That is not hypothetical: it is the Alpha_v1 security review's SEC-1, where
 * it silently disabled rate limiting, and it recurred in Alpha_v2's status
 * queries, where it would have taken out the licenses page and the application
 * overview entirely.
 *
 * These tests inspect the generated SQL rather than executing it, so they
 * catch the shape of the parameter regardless of which driver is underneath.
 */

function boundParams(query: { toSQL: () => { params: unknown[] } }): unknown[] {
  return query.toSQL().params;
}

function hasDateParam(params: unknown[]): boolean {
  return params.some((param) => param instanceof Date);
}

describe("instant()", () => {
  it("binds an ISO string, not a Date", () => {
    const query = db
      .select()
      .from(licenses)
      .where(sql`${licenses.expiresAt} <= ${instant(NOW)}`);

    expect(boundParams(query)).toContain("2026-08-15T12:00:00.000Z");
    expect(hasDateParam(boundParams(query))).toBe(false);
  });

  it("casts explicitly, so the type does not depend on inference", () => {
    // Inside a CASE, Postgres has much less context to infer a parameter's
    // type from than it does beside a column comparison.
    const query = db
      .select()
      .from(licenses)
      .where(sql`CASE WHEN ${licenses.expiresAt} <= ${instant(NOW)} THEN true ELSE false END`);

    expect(query.toSQL().sql).toContain("::timestamptz");
  });

  it("produces SQL Postgres actually accepts", async () => {
    // PGlite is a real Postgres, so this proves the cast is valid syntax and
    // the comparison works — it just cannot prove the parameter shape, which
    // is what the assertions above are for.
    const rows = await db
      .select({ id: licenses.id })
      .from(licenses)
      .where(sql`${licenses.expiresAt} IS NOT NULL AND ${licenses.expiresAt} <= ${instant(NOW)}`);

    expect(Array.isArray(rows)).toBe(true);
  });
});

describe("no query binds a raw Date", () => {
  it("holds for the effective-status projection", () => {
    const query = db
      .select({
        id: licenses.id,
        effectiveStatus: sql`CASE
          WHEN ${licenses.status} = 'revoked' THEN 'revoked'
          WHEN ${licenses.expiresAt} IS NOT NULL AND ${licenses.expiresAt} <= ${instant(NOW)} THEN 'expired'
          ELSE 'active'
        END`,
      })
      .from(licenses);

    expect(hasDateParam(boundParams(query))).toBe(false);
  });

  it("holds for the active and expired filters", () => {
    const active = db
      .select()
      .from(licenses)
      .where(
        sql`${licenses.status} = 'active' AND (${licenses.expiresAt} IS NULL OR ${licenses.expiresAt} > ${instant(NOW)})`,
      );

    const expired = db
      .select()
      .from(licenses)
      .where(
        sql`${licenses.status} = 'active' AND ${licenses.expiresAt} IS NOT NULL AND ${licenses.expiresAt} <= ${instant(NOW)}`,
      );

    expect(hasDateParam(boundParams(active))).toBe(false);
    expect(hasDateParam(boundParams(expired))).toBe(false);
  });

  it("holds for the filtered-aggregate stats", () => {
    const query = db
      .select({
        active: sql<number>`count(*) FILTER (
          WHERE ${licenses.status} = 'active'
            AND (${licenses.expiresAt} IS NULL OR ${licenses.expiresAt} > ${instant(NOW)})
        )`,
      })
      .from(licenses)
      .leftJoin(activations, eq(activations.licenseId, licenses.id));

    expect(hasDateParam(boundParams(query))).toBe(false);
  });

  it("holds for the metadata export projection", () => {
    const query = db
      .select({
        effectiveStatus: sql`CASE
          WHEN ${licenses.status} = 'revoked' THEN 'revoked'
          WHEN ${licenses.expiresAt} IS NOT NULL AND ${licenses.expiresAt} <= ${instant(NOW)} THEN 'expired'
          ELSE 'active'
        END`,
      })
      .from(licenses)
      .where(
        and(
          inArray(licenses.id, ["lic_a"]),
          inArray(
            licenses.applicationId,
            db.select({ id: applications.id }).from(applications).where(eq(applications.ownerId, "user_a")),
          ),
        ),
      );

    expect(hasDateParam(boundParams(query))).toBe(false);
  });

  it("demonstrates what the mistake looks like, so the guard is meaningful", () => {
    // This is the shape that passes against PGlite and throws in production.
    // Asserted here so the detection itself is proven to work.
    const wrong = db
      .select()
      .from(licenses)
      .where(sql`${licenses.expiresAt} <= ${NOW}`);

    expect(hasDateParam(boundParams(wrong))).toBe(true);
  });
});

describe("Drizzle's typed operators are safe without the helper", () => {
  it("serializes a Date through the column mapper", () => {
    // `eq`, `lt` and friends run the column's own mapper, so they were never
    // the problem — only raw `sql` templates are.
    const query = db.select().from(licenses).where(eq(licenses.expiresAt, NOW));

    expect(hasDateParam(boundParams(query))).toBe(false);
    expect(boundParams(query).some((param) => typeof param === "string")).toBe(true);
  });
});
