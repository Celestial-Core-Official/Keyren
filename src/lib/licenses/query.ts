import { and, asc, count, desc, eq, isNotNull, isNull, or, sql, type SQL } from "drizzle-orm";
import { activations, licenses, applications } from "@/db/schema";
import type { Database } from "@/db/types";
import { instant } from "@/lib/db/timestamp";
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
 * the application and filter in JavaScript — works fine at ten licenses and falls
 * over at ten thousand, and the whole point of this release is that the list
 * stays usable when it is long. Filtering, counting, sorting and slicing are
 * therefore all the database's job.
 */

/**
 * Confirms the application exists AND belongs to this developer.
 *
 * Duplicated from the service rather than exported across module boundaries so
 * neither file can have its ownership check removed by an edit to the other.
 */
async function assertOwnsApplication(
  db: Database,
  ownerId: string,
  applicationId: string,
): Promise<void> {
  const [row] = await db
    .select({ id: applications.id })
    .from(applications)
    .where(and(eq(applications.id, applicationId), eq(applications.ownerId, ownerId)))
    .limit(1);

  if (!row) throw notFound("Application");
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
    WHEN ${licenses.expiresAt} IS NOT NULL AND ${licenses.expiresAt} <= ${instant(now)} THEN 'expired'
    ELSE 'active'
  END`;
}

function filterConditions(
  applicationId: string,
  query: LicenseQuery,
  now: Date,
): SQL[] {
  const conditions: SQL[] = [eq(licenses.applicationId, applicationId)];

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
        sql`${licenses.status} = 'active' AND (${licenses.expiresAt} IS NULL OR ${licenses.expiresAt} > ${instant(now)})`,
      );
      break;
    case "revoked":
      conditions.push(eq(licenses.status, "revoked"));
      break;
    case "expired":
      conditions.push(
        sql`${licenses.status} = 'active' AND ${licenses.expiresAt} IS NOT NULL AND ${licenses.expiresAt} <= ${instant(now)}`,
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
  applicationId: string,
  query: LicenseQuery,
  now: Date = new Date(),
): Promise<LicensePage> {
  await assertOwnsApplication(db, ownerId, applicationId);

  const conditions = filterConditions(applicationId, query, now);
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
    // At least one, so an empty application reads as "page 1 of 1" rather than
    // "page 1 of 0".
    pageCount: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}

/**
 * Per-status counts for one application, in a single round trip.
 *
 * The overview cards need Active, Expired, Revoked and bound-device totals.
 * Four `SELECT count(*)` calls would be four round trips for numbers that all
 * come from the same rows, so they are computed as filtered aggregates over
 * one scan.
 */
export type ApplicationLicenseStats = {
  total: number;
  active: number;
  expired: number;
  revoked: number;
  boundDevices: number;
  /**
   * Licenses with any activation row at all, locked or not.
   *
   * An activation row is only ever written by a successful verification, so a
   * non-zero count is proof that this application's integration has worked at
   * least once — which is what the onboarding checklist needs, derived from
   * real data rather than a flag somebody has to remember to set.
   */
  activated: number;
};

export async function getApplicationLicenseStats(
  db: Database,
  ownerId: string,
  applicationId: string,
  now: Date = new Date(),
): Promise<ApplicationLicenseStats> {
  await assertOwnsApplication(db, ownerId, applicationId);

  const [row] = await db
    .select({
      total: count(),
      active: sql<number>`count(*) FILTER (
        WHERE ${licenses.status} = 'active'
          AND (${licenses.expiresAt} IS NULL OR ${licenses.expiresAt} > ${instant(now)})
      )`,
      expired: sql<number>`count(*) FILTER (
        WHERE ${licenses.status} = 'active'
          AND ${licenses.expiresAt} IS NOT NULL
          AND ${licenses.expiresAt} <= ${instant(now)}
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
    .where(eq(licenses.applicationId, applicationId));

  return {
    total: Number(row?.total ?? 0),
    active: Number(row?.active ?? 0),
    expired: Number(row?.expired ?? 0),
    revoked: Number(row?.revoked ?? 0),
    boundDevices: Number(row?.boundDevices ?? 0),
    activated: Number(row?.activated ?? 0),
  };
}

/**
 * The developer's whole account, in one row.
 *
 * Scoped by joining through `applications` on `owner_id` rather than by
 * collecting application ids first and passing them back in — one query
 * either way, and no chance of the second one being called with a list the
 * first did not filter.
 */
export type OverviewStats = {
  applications: number;
  total: number;
  active: number;
  expired: number;
  revoked: number;
  expiringSoon: number;
};

export const EXPIRING_SOON_DAYS = 30;

export async function getOverviewStats(
  db: Database,
  ownerId: string,
  now: Date = new Date(),
): Promise<OverviewStats> {
  const soon = new Date(now.getTime() + EXPIRING_SOON_DAYS * 24 * 60 * 60 * 1000);

  const [row] = await db
    .select({
      applications: sql<number>`count(DISTINCT ${applications.id})`,
      total: sql<number>`count(${licenses.id})`,
      active: sql<number>`count(${licenses.id}) FILTER (
        WHERE ${licenses.status} = 'active'
          AND (${licenses.expiresAt} IS NULL OR ${licenses.expiresAt} > ${instant(now)})
      )`,
      expired: sql<number>`count(${licenses.id}) FILTER (
        WHERE ${licenses.status} = 'active'
          AND ${licenses.expiresAt} IS NOT NULL
          AND ${licenses.expiresAt} <= ${instant(now)}
      )`,
      revoked: sql<number>`count(${licenses.id}) FILTER (WHERE ${licenses.status} = 'revoked')`,
      // Already-expired licenses are excluded: something that lapsed last week
      // is not "expiring soon", it is a different problem with its own count.
      expiringSoon: sql<number>`count(${licenses.id}) FILTER (
        WHERE ${licenses.status} = 'active'
          AND ${licenses.expiresAt} IS NOT NULL
          AND ${licenses.expiresAt} > ${instant(now)}
          AND ${licenses.expiresAt} <= ${instant(soon)}
      )`,
    })
    .from(applications)
    .leftJoin(licenses, eq(licenses.applicationId, applications.id))
    .where(eq(applications.ownerId, ownerId));

  return {
    applications: Number(row?.applications ?? 0),
    total: Number(row?.total ?? 0),
    active: Number(row?.active ?? 0),
    expired: Number(row?.expired ?? 0),
    revoked: Number(row?.revoked ?? 0),
    expiringSoon: Number(row?.expiringSoon ?? 0),
  };
}

export type ExpiringLicense = {
  id: string;
  label: string | null;
  keyLast4: string;
  expiresAt: Date;
  applicationId: string;
  applicationName: string;
};

/**
 * The licenses about to lapse, soonest first.
 *
 * This is the one thing on the dashboard worth acting on before a customer
 * writes in, which is why it is a list of specific licenses rather than
 * another number.
 */
export async function getExpiringSoon(
  db: Database,
  ownerId: string,
  limit = 5,
  now: Date = new Date(),
): Promise<ExpiringLicense[]> {
  const soon = new Date(now.getTime() + EXPIRING_SOON_DAYS * 24 * 60 * 60 * 1000);

  const rows = await db
    .select({
      id: licenses.id,
      label: licenses.label,
      keyLast4: licenses.keyLast4,
      expiresAt: licenses.expiresAt,
      applicationId: applications.id,
      applicationName: applications.name,
    })
    .from(licenses)
    .innerJoin(applications, eq(applications.id, licenses.applicationId))
    .where(
      and(
        eq(applications.ownerId, ownerId),
        eq(licenses.status, "active"),
        isNotNull(licenses.expiresAt),
        sql`${licenses.expiresAt} > ${instant(now)}`,
        sql`${licenses.expiresAt} <= ${instant(soon)}`,
      ),
    )
    .orderBy(asc(licenses.expiresAt))
    .limit(limit);

  // expiresAt is non-null by the WHERE clause; the column type does not know.
  return rows.map((row) => ({ ...row, expiresAt: row.expiresAt as Date }));
}

export type ApplicationBreakdownRow = {
  id: string;
  name: string;
  disabled: boolean;
  total: number;
  active: number;
};

/** Per-application totals, so the overview says which application is which. */
export async function getApplicationBreakdown(
  db: Database,
  ownerId: string,
  now: Date = new Date(),
): Promise<ApplicationBreakdownRow[]> {
  const rows = await db
    .select({
      id: applications.id,
      name: applications.name,
      disabledAt: applications.disabledAt,
      total: sql<number>`count(${licenses.id})`,
      active: sql<number>`count(${licenses.id}) FILTER (
        WHERE ${licenses.status} = 'active'
          AND (${licenses.expiresAt} IS NULL OR ${licenses.expiresAt} > ${instant(now)})
      )`,
    })
    .from(applications)
    .leftJoin(licenses, eq(licenses.applicationId, applications.id))
    .where(eq(applications.ownerId, ownerId))
    .groupBy(applications.id)
    .orderBy(desc(sql`count(${licenses.id})`), asc(applications.name));

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    disabled: row.disabledAt !== null,
    total: Number(row.total),
    active: Number(row.active),
  }));
}
