import { and, eq, inArray, sql } from "drizzle-orm";
import { activations, licenses, products } from "@/db/schema";
import type { Database } from "@/db/types";
import { maskedLicenseKey } from "@/lib/crypto/license-key";
import type { LicenseMetadataRow } from "./export";
import type { EffectiveStatus } from "./types";

/**
 * Operations over a set of selected licenses.
 *
 * Two properties matter more than anything else here.
 *
 * First, ownership is expressed in SQL, as a subquery over `products`. There
 * is no "load them, check them in JavaScript, then write" path that a future
 * edit could quietly drop — a license belonging to somebody else simply is
 * not in the set the statement touches.
 *
 * Second, the counts distinguish "changed" from "already in that state" but
 * NOT "yours and missing" from "somebody else's". Telling those apart would
 * turn a bulk action into an oracle for whether a guessed license id belongs
 * to another developer.
 */

export type BulkResult = {
  /** Licenses this call actually modified. */
  changed: number;
  /** Owned licenses that were already in the requested state. */
  skipped: number;
  /** Ids that resolved to nothing — missing or another developer's. */
  notFound: number;
};

const EMPTY: BulkResult = { changed: 0, skipped: 0, notFound: 0 };

/** The ids of every product this developer owns, as a subquery. */
function ownedProducts(db: Database, ownerId: string) {
  return db
    .select({ id: products.id })
    .from(products)
    .where(eq(products.ownerId, ownerId));
}

/**
 * Resolves the selection, decides what is eligible, applies the change, and
 * reports honest counts — all inside one transaction so the numbers describe
 * the same snapshot the write acted on.
 *
 * Duplicates are collapsed first: selecting the same license three times is a
 * UI artefact, not a request to revoke it three times, and it would otherwise
 * inflate every count.
 */
async function applyToEligible(
  db: Database,
  ownerId: string,
  licenseIds: readonly string[],
  isEligible: (row: Record<string, unknown>) => boolean,
  extraColumns: Record<string, unknown>,
  run: (tx: Database, eligibleIds: string[]) => Promise<unknown>,
): Promise<BulkResult> {
  const unique = [...new Set(licenseIds)];
  if (unique.length === 0) return EMPTY;

  return db.transaction(async (tx) => {
    const owned = (await tx
      .select({ id: licenses.id, ...extraColumns })
      .from(licenses)
      .leftJoin(activations, eq(activations.licenseId, licenses.id))
      .where(
        and(
          inArray(licenses.id, unique),
          inArray(licenses.productId, ownedProducts(tx as unknown as Database, ownerId)),
        ),
      )) as Record<string, unknown>[];

    const eligible = owned.filter(isEligible).map((row) => row.id as string);
    // `tx`, never the outer handle. Writing through `db` here would run the
    // statement outside the transaction the counts were computed in — and on
    // a single-connection driver it simply blocks forever.
    if (eligible.length > 0) await run(tx as unknown as Database, eligible);

    return {
      changed: eligible.length,
      skipped: owned.length - eligible.length,
      notFound: unique.length - owned.length,
    };
  });
}

export async function bulkRevokeLicenses(
  db: Database,
  ownerId: string,
  licenseIds: readonly string[],
): Promise<BulkResult> {
  const now = new Date();

  return applyToEligible(
    db,
    ownerId,
    licenseIds,
    (row) => row.status === "active",
    { status: licenses.status },
    async (tx, ids) => {
      await tx
        .update(licenses)
        .set({ status: "revoked", revokedAt: now, updatedAt: now })
        .where(inArray(licenses.id, ids));
    },
  );
}

export async function bulkRestoreLicenses(
  db: Database,
  ownerId: string,
  licenseIds: readonly string[],
): Promise<BulkResult> {
  return applyToEligible(
    db,
    ownerId,
    licenseIds,
    (row) => row.status === "revoked",
    { status: licenses.status },
    async (tx, ids) => {
      await tx
        .update(licenses)
        .set({ status: "active", revokedAt: null, updatedAt: new Date() })
        .where(inArray(licenses.id, ids));
    },
  );
}

export async function bulkResetActivations(
  db: Database,
  ownerId: string,
  licenseIds: readonly string[],
): Promise<BulkResult> {
  return applyToEligible(
    db,
    ownerId,
    licenseIds,
    // Only a license that actually holds a binding counts as changed —
    // resetting one that never activated is a no-op, and reporting it as a
    // change would overstate what happened.
    (row) => row.activationId !== null,
    { activationId: activations.id },
    async (tx, ids) => {
      await tx.delete(activations).where(inArray(activations.licenseId, ids));
    },
  );
}

export async function bulkDeleteLicenses(
  db: Database,
  ownerId: string,
  licenseIds: readonly string[],
): Promise<BulkResult> {
  return applyToEligible(
    db,
    ownerId,
    licenseIds,
    // Every owned license can be deleted, whatever state it is in.
    () => true,
    {},
    async (tx, ids) => {
      await tx.delete(licenses).where(inArray(licenses.id, ids));
    },
  );
}

/**
 * Metadata for the selected licenses, for the "export selection" action.
 *
 * The return type is `LicenseMetadataRow`, which has no field capable of
 * carrying a key — the closest it comes is the masked reference, which is four
 * characters that were captured at creation precisely so the dashboard would
 * have something non-secret to point at.
 */
export async function licensesForExport(
  db: Database,
  ownerId: string,
  licenseIds: readonly string[],
  now: Date = new Date(),
): Promise<LicenseMetadataRow[]> {
  const unique = [...new Set(licenseIds)];
  if (unique.length === 0) return [];

  const rows = await db
    .select({
      label: licenses.label,
      keyLast4: licenses.keyLast4,
      productId: licenses.productId,
      status: licenses.status,
      effectiveStatus: sql<EffectiveStatus>`CASE
        WHEN ${licenses.status} = 'revoked' THEN 'revoked'
        WHEN ${licenses.expiresAt} IS NOT NULL AND ${licenses.expiresAt} <= ${now} THEN 'expired'
        ELSE 'active'
      END`,
      expiresAt: licenses.expiresAt,
      hwidLocked: licenses.hwidLocked,
      activatedAt: activations.activatedAt,
      lastSeenAt: activations.lastSeenAt,
      createdAt: licenses.createdAt,
    })
    .from(licenses)
    .leftJoin(activations, eq(activations.licenseId, licenses.id))
    .where(
      and(
        inArray(licenses.id, unique),
        inArray(licenses.productId, ownedProducts(db, ownerId)),
      ),
    )
    .orderBy(licenses.createdAt);

  return rows.map(({ keyLast4, ...row }) => ({
    ...row,
    maskedKey: maskedLicenseKey(keyLast4),
  }));
}
