import { and, asc, count, desc, eq, isNotNull, isNull, or, sql, type SQL } from "drizzle-orm";
import { activations, licenses, products } from "@/db/schema";
import type { Database } from "@/db/types";
import { notFound } from "@/lib/errors";
import { containsPattern } from "@/lib/search";
import { toLicenseView } from "./service";
import type {
  EffectiveStatus,
  LicensePage,
  LicenseQuery,
  LicenseSort,
} from "./types";

/**
 * Reads for the license browser.
 *
 * Everything happens in SQL. The obvious alternative — fetch every license for
 * the product and filter in JavaScript — works fine at ten licenses and falls
 * over at ten thousand, and the whole point of this release is that the list
 * stays usable when it is long. Filtering, counting, sorting and slicing are
 * therefore all the database's job.
 */

/**
 * Confirms the product exists AND belongs to this developer.
 *
 * Duplicated from the service rather than exported across module boundaries so
 * neither file can have its ownership check removed by an edit to the other.
 */
async function assertOwnsProduct(
  db: Database,
  ownerId: string,
  productId: string,
): Promise<void> {
  const [row] = await db
    .select({ id: products.id })
    .from(products)
    .where(and(eq(products.id, productId), eq(products.ownerId, ownerId)))
    .limit(1);

  if (!row) throw notFound("Product");
}

/**
 * The status the dashboard shows, computed in SQL so a filter on it and the
 * badge rendered in the row can never disagree.
 *
 * Revocation outranks expiry: it is the developer's deliberate act, and
 * "revoked" is the more useful thing to see on a license that is both.
 */
function effectiveStatusSql(now: Date): SQL<EffectiveStatus> {
  return sql<EffectiveStatus>`CASE
    WHEN ${licenses.status} = 'revoked' THEN 'revoked'
    WHEN ${licenses.expiresAt} IS NOT NULL AND ${licenses.expiresAt} <= ${now} THEN 'expired'
    ELSE 'active'
  END`;
}

function filterConditions(
  productId: string,
  query: LicenseQuery,
  now: Date,
): SQL[] {
  const conditions: SQL[] = [eq(licenses.productId, productId)];

  const term = query.q.trim();
  if (term !== "") {
    const pattern = containsPattern(term);
    // `key_last4` is included so a developer can paste the tail of a key a
    // customer read out to them. There is nothing else of the key to search:
    // the rest was never stored.
    const match = or(
      sql`${licenses.label} ILIKE ${pattern}`,
      sql`${licenses.notes} ILIKE ${pattern}`,
      sql`${licenses.keyLast4} ILIKE ${pattern}`,
    );
    if (match) conditions.push(match);
  }

  switch (query.status) {
    case "active":
      conditions.push(
        sql`${licenses.status} = 'active' AND (${licenses.expiresAt} IS NULL OR ${licenses.expiresAt} > ${now})`,
      );
      break;
    case "revoked":
      conditions.push(eq(licenses.status, "revoked"));
      break;
    case "expired":
      conditions.push(
        sql`${licenses.status} = 'active' AND ${licenses.expiresAt} IS NOT NULL AND ${licenses.expiresAt} <= ${now}`,
      );
      break;
    case "all":
      break;
  }

  if (query.activation === "activated") conditions.push(isNotNull(activations.id));
  if (query.activation === "unactivated") conditions.push(isNull(activations.id));

  if (query.lock === "locked") conditions.push(eq(licenses.hwidLocked, true));
  if (query.lock === "unlocked") conditions.push(eq(licenses.hwidLocked, false));

  return conditions;
}

/**
 * `NULLS LAST` is chosen per sort rather than inherited from Postgres's
 * default, which places NULLs last for ASC and first for DESC.
 *
 * An unlabeled license belongs at the bottom of an A–Z list, and a permanent
 * license is not "expiring furthest in the future" — it is not expiring at
 * all, so it belongs after everything that is. The trailing `licenses.id` is
 * the tiebreaker: without it, rows sharing a sort key can come back in a
 * different order per query, which makes a row appear on two pages or on
 * none.
 */
function orderBy(sort: LicenseSort): SQL[] {
  const tiebreak = asc(licenses.id);

  switch (sort) {
    case "oldest":
      return [asc(licenses.createdAt), tiebreak];
    case "label":
      return [sql`${licenses.label} ASC NULLS LAST`, tiebreak];
    case "expiresSoon":
      return [sql`${licenses.expiresAt} ASC NULLS LAST`, tiebreak];
    case "lastSeen":
      return [sql`${activations.lastSeenAt} DESC NULLS LAST`, tiebreak];
    case "newest":
      return [desc(licenses.createdAt), tiebreak];
  }
}

export async function queryLicenses(
  db: Database,
  ownerId: string,
  productId: string,
  query: LicenseQuery,
  now: Date = new Date(),
): Promise<LicensePage> {
  await assertOwnsProduct(db, ownerId, productId);

  const conditions = filterConditions(productId, query, now);
  const where = and(...conditions);

  // The activation join is LEFT and `activations_license_unique` guarantees at
  // most one row per license, so it cannot multiply the result set — which is
  // what makes this count trustworthy alongside the paged select.
  const [totals] = await db
    .select({ total: count() })
    .from(licenses)
    .leftJoin(activations, eq(activations.licenseId, licenses.id))
    .where(where);

  const total = Number(totals?.total ?? 0);

  const rows = await db
    .select({
      license: licenses,
      activation: activations,
      effectiveStatus: effectiveStatusSql(now),
    })
    .from(licenses)
    .leftJoin(activations, eq(activations.licenseId, licenses.id))
    .where(where)
    .orderBy(...orderBy(query.sort))
    .limit(query.pageSize)
    .offset((query.page - 1) * query.pageSize);

  return {
    rows: rows.map((row) => ({
      ...toLicenseView(row.license, row.activation),
      effectiveStatus: row.effectiveStatus,
    })),
    total,
    page: query.page,
    pageSize: query.pageSize,
    // At least one, so an empty product reads as "page 1 of 1" rather than
    // "page 1 of 0".
    pageCount: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}

/**
 * Per-status counts for one product, in a single round trip.
 *
 * The overview cards need Active, Expired, Revoked and bound-device totals.
 * Four `SELECT count(*)` calls would be four round trips for numbers that all
 * come from the same rows, so they are computed as filtered aggregates over
 * one scan.
 */
export type ProductLicenseStats = {
  total: number;
  active: number;
  expired: number;
  revoked: number;
  boundDevices: number;
  /**
   * Licenses with any activation row at all, locked or not.
   *
   * An activation row is only ever written by a successful verification, so a
   * non-zero count is proof that this product's integration has worked at
   * least once — which is what the onboarding checklist needs, derived from
   * real data rather than a flag somebody has to remember to set.
   */
  activated: number;
};

export async function getProductLicenseStats(
  db: Database,
  ownerId: string,
  productId: string,
  now: Date = new Date(),
): Promise<ProductLicenseStats> {
  await assertOwnsProduct(db, ownerId, productId);

  const [row] = await db
    .select({
      total: count(),
      active: sql<number>`count(*) FILTER (
        WHERE ${licenses.status} = 'active'
          AND (${licenses.expiresAt} IS NULL OR ${licenses.expiresAt} > ${now})
      )`,
      expired: sql<number>`count(*) FILTER (
        WHERE ${licenses.status} = 'active'
          AND ${licenses.expiresAt} IS NOT NULL
          AND ${licenses.expiresAt} <= ${now}
      )`,
      revoked: sql<number>`count(*) FILTER (WHERE ${licenses.status} = 'revoked')`,
      // "Bound" means a device is actually held: an unlocked license with an
      // activation row has merely been seen recently, and counting it would
      // overstate how many customers are pinned to a machine.
      boundDevices: sql<number>`count(*) FILTER (
        WHERE ${licenses.hwidLocked} = true AND ${activations.id} IS NOT NULL
      )`,
      activated: sql<number>`count(*) FILTER (WHERE ${activations.id} IS NOT NULL)`,
    })
    .from(licenses)
    .leftJoin(activations, eq(activations.licenseId, licenses.id))
    .where(eq(licenses.productId, productId));

  return {
    total: Number(row?.total ?? 0),
    active: Number(row?.active ?? 0),
    expired: Number(row?.expired ?? 0),
    revoked: Number(row?.revoked ?? 0),
    boundDevices: Number(row?.boundDevices ?? 0),
    activated: Number(row?.activated ?? 0),
  };
}
