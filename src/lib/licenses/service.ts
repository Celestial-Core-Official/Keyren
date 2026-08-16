import { and, desc, eq } from "drizzle-orm";
import { activations, licenses, applications } from "@/db/schema";
import type { Database } from "@/db/types";
import { generateLicenseId } from "@/lib/crypto/ids";
import {
  generateLicenseKey,
  hashLicenseKey,
  licenseKeyLast4,
} from "@/lib/crypto/license-key";
import { notFound } from "@/lib/errors";
import { resolveExpiresAt, type ExpirationInput } from "./expiration";

/**
 * The shape the dashboard is allowed to see.
 *
 * Deliberately excludes `keyHash`: it is a server-side secret derivative and
 * has no business crossing into a React payload. Only `keyLast4` leaves the
 * server, and four characters of a 160-bit key are not sensitive.
 */
export type LicenseView = {
  id: string;
  applicationId: string;
  keyLast4: string;
  /** Dashboard-only. Never crosses into the public verification response. */
  label: string | null;
  notes: string | null;
  status: "active" | "revoked";
  expiresAt: Date | null;
  hwidLocked: boolean;
  createdAt: Date;
  updatedAt: Date;
  revokedAt: Date | null;
  activation: { activatedAt: Date; lastSeenAt: Date } | null;
};

export type CreateLicenseInput = {
  applicationId: string;
  expiration: ExpirationInput;
  hwidLocked: boolean;
  secret: string;
  label?: string | null;
  notes?: string | null;
};

/** The mutable half of a license. Everything else is fixed at creation. */
export type LicenseDetailsInput = {
  label: string | null;
  notes: string | null;
};

/**
 * Confirms the application exists AND belongs to this developer, in one query.
 * Every license operation funnels through this, which is what makes the
 * `Clerk user -> owns application -> application owns license` chain unskippable.
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

export async function createLicense(
  db: Database,
  ownerId: string,
  input: CreateLicenseInput,
): Promise<{ license: LicenseView; plaintextKey: string }> {
  await assertOwnsApplication(db, ownerId, input.applicationId);

  const now = new Date();
  const plaintextKey = generateLicenseKey();
  const expiresAt = resolveExpiresAt(input.expiration, now);

  const [row] = await db
    .insert(licenses)
    .values({
      id: generateLicenseId(),
      applicationId: input.applicationId,
      // The plaintext is hashed here and then only ever returned to the
      // caller. It is not logged, not cached, and not written anywhere.
      keyHash: hashLicenseKey(plaintextKey, input.secret),
      keyLast4: licenseKeyLast4(plaintextKey),
      label: input.label ?? null,
      notes: input.notes ?? null,
      status: "active",
      expiresAt,
      hwidLocked: input.hwidLocked,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  if (!row) throw new Error("Failed to create license");

  return { license: toLicenseView(row, null), plaintextKey };
}

export async function listLicenses(
  db: Database,
  ownerId: string,
  applicationId: string,
): Promise<LicenseView[]> {
  await assertOwnsApplication(db, ownerId, applicationId);

  const rows = await db
    .select({ license: licenses, activation: activations })
    .from(licenses)
    .leftJoin(activations, eq(activations.licenseId, licenses.id))
    .where(eq(licenses.applicationId, applicationId))
    .orderBy(desc(licenses.createdAt));

  return rows.map((row) => toLicenseView(row.license, row.activation));
}

export function toLicenseView(
  row: typeof licenses.$inferSelect,
  activation: typeof activations.$inferSelect | null,
): LicenseView {
  return {
    id: row.id,
    applicationId: row.applicationId,
    keyLast4: row.keyLast4,
    label: row.label,
    notes: row.notes,
    status: row.status,
    expiresAt: row.expiresAt,
    hwidLocked: row.hwidLocked,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    revokedAt: row.revokedAt,
    activation: activation
      ? { activatedAt: activation.activatedAt, lastSeenAt: activation.lastSeenAt }
      : null,
  };
}

/**
 * Resolves a license ID to its row only if the calling developer owns the
 * application that owns it. This is the `Clerk user -> owns application -> application
 * owns license` chain expressed as a single join, so no caller can perform a
 * mutation without it having been proven.
 */
async function findOwnedLicense(
  db: Database,
  ownerId: string,
  licenseId: string,
): Promise<typeof licenses.$inferSelect | null> {
  const [row] = await db
    .select({ license: licenses })
    .from(licenses)
    .innerJoin(applications, eq(applications.id, licenses.applicationId))
    .where(and(eq(licenses.id, licenseId), eq(applications.ownerId, ownerId)))
    .limit(1);

  return row?.license ?? null;
}

export async function getLicense(
  db: Database,
  ownerId: string,
  licenseId: string,
): Promise<LicenseView | null> {
  const [row] = await db
    .select({ license: licenses, activation: activations })
    .from(licenses)
    .innerJoin(applications, eq(applications.id, licenses.applicationId))
    .leftJoin(activations, eq(activations.licenseId, licenses.id))
    .where(and(eq(licenses.id, licenseId), eq(applications.ownerId, ownerId)))
    .limit(1);

  return row ? toLicenseView(row.license, row.activation) : null;
}

export async function revokeLicense(
  db: Database,
  ownerId: string,
  licenseId: string,
): Promise<LicenseView> {
  const owned = await findOwnedLicense(db, ownerId, licenseId);
  if (!owned) throw notFound("License");

  const now = new Date();
  // Revoking is a state change, never a delete. The record, its creation
  // time, and its activation history all survive so it can be restored.
  const [row] = await db
    .update(licenses)
    .set({ status: "revoked", revokedAt: now, updatedAt: now })
    .where(eq(licenses.id, licenseId))
    .returning();

  if (!row) throw notFound("License");
  return toLicenseView(row, null);
}

export async function restoreLicense(
  db: Database,
  ownerId: string,
  licenseId: string,
): Promise<LicenseView> {
  const owned = await findOwnedLicense(db, ownerId, licenseId);
  if (!owned) throw notFound("License");

  const [row] = await db
    .update(licenses)
    .set({ status: "active", revokedAt: null, updatedAt: new Date() })
    .where(eq(licenses.id, licenseId))
    .returning();

  if (!row) throw notFound("License");
  return toLicenseView(row, null);
}

/**
 * Edits the two mutable, dashboard-only fields.
 *
 * The SET clause names exactly `label`, `notes` and `updatedAt`. Nothing
 * about the license's identity or its licensing decision — the key hash, the
 * status, the expiry, the device lock — is reachable from this path, so a
 * relabel can never become an accidental un-revoke.
 */
export async function updateLicenseDetails(
  db: Database,
  ownerId: string,
  licenseId: string,
  details: LicenseDetailsInput,
): Promise<LicenseView> {
  const owned = await findOwnedLicense(db, ownerId, licenseId);
  if (!owned) throw notFound("License");

  const [row] = await db
    .update(licenses)
    .set({ label: details.label, notes: details.notes, updatedAt: new Date() })
    .where(eq(licenses.id, licenseId))
    .returning();

  if (!row) throw notFound("License");
  return toLicenseView(row, null);
}

/**
 * Clears the device binding so the next valid device can claim the license.
 * Succeeds silently when there is nothing bound — the developer's intent is
 * "this license should be claimable", and it already is.
 */
export async function resetActivation(
  db: Database,
  ownerId: string,
  licenseId: string,
): Promise<LicenseView> {
  const owned = await findOwnedLicense(db, ownerId, licenseId);
  if (!owned) throw notFound("License");

  await db.delete(activations).where(eq(activations.licenseId, licenseId));

  // Returned so the caller can name the license in its confirmation without a
  // second lookup. The activation is gone, hence null.
  return toLicenseView(owned, null);
}

/**
 * Permanent and irreversible. The activation row cascades away with it.
 * A deleted license can never authenticate again — there is no tombstone and
 * no recovery, which is exactly why the UI gates this behind a typed
 * confirmation.
 */
export async function deleteLicense(
  db: Database,
  ownerId: string,
  licenseId: string,
): Promise<LicenseView> {
  const owned = await findOwnedLicense(db, ownerId, licenseId);
  if (!owned) throw notFound("License");

  await db.delete(licenses).where(eq(licenses.id, licenseId));

  // The row is gone, so its label and masked key are captured here — the
  // caller could not look them up afterwards to say what it deleted.
  return toLicenseView(owned, null);
}
