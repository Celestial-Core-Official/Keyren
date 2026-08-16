import { sql, type SQL } from "drizzle-orm";

/**
 * Binds an instant into a raw `sql` template.
 *
 * **Never interpolate a `Date` directly.** Drizzle's typed operators (`eq`,
 * `lt`, and friends) run the column's own mapper and serialize a `Date`
 * correctly, but a raw `sql` template does not — it hands the value straight
 * to the driver, and **postgres.js rejects a `Date` parameter** with
 * `ERR_INVALID_ARG_TYPE`.
 *
 * PGlite, which the test suite uses, accepts it happily. That asymmetry is
 * what makes this dangerous: a query written with `${now}` passes every test
 * and then throws on the first production request. It is the same defect the
 * Alpha_v1 security review recorded as SEC-1, where it silently disabled rate
 * limiting; in Alpha_v2 it would have taken out the licenses page and the
 * application overview.
 *
 * An ISO string with an explicit `::timestamptz` cast is unambiguous
 * regardless of where in the expression it appears — including inside a
 * `CASE`, where Postgres has less context to infer a parameter's type from.
 *
 * `tests/db/timestamp.test.ts` inspects the generated SQL of every query that
 * takes a `now` and fails if any bound parameter is a `Date`, so this cannot
 * regress without a test catching it.
 */
export function instant(value: Date): SQL {
  return sql`${value.toISOString()}::timestamptz`;
}
