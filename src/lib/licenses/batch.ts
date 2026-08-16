import { and, eq } from "drizzle-orm";
import { licenses, applications } from "@/db/schema";
import type { Database } from "@/db/types";
import { generateLicenseId } from "@/lib/crypto/ids";
import {
  generateLicenseKey,
  hashLicenseKey,
  licenseKeyLast4,
} from "@/lib/crypto/license-key";
import { notFound } from "@/lib/errors";
import { resolveExpiresAt, type ExpirationInput } from "./expiration";
import {
  BATCH_QUANTITY_MAX,
  BATCH_QUANTITY_MIN,
  LICENSE_LABEL_MAX,
} from "./types";

/**
 * Batch license creation.
 *
 * Separate from `service.ts` because it has a different contract: it is the
 * one place that produces many plaintext keys at once, and it must produce
 * either all of them or none. A half-completed batch is worse than a failed
 * one — the developer has no way to tell which keys exist, and the keys that
 * were created are unrecoverable because the response never arrived.
 */

export type CreateBatchInput = {
  applicationId: string;
  quantity: number;
  expiration: ExpirationInput;
  hwidLocked: boolean;
  secret: string;
  label: string | null;
  notes: string | null;
  /**
   * Overridable purely so tests can force the `key_hash` unique index to fire
   * and prove the batch rolls back. At 160 bits a natural collision will never
   * happen, so there is no other honest way to exercise that path.
   */
  generateKey?: () => string;
};

/**
 * One created license, shaped to match the export columns exactly.
 *
 * `licenseKey` is plaintext and exists only in this value. It is returned to
 * the caller, rendered once, and never written anywhere — not to the database,
 * not to a log, not to a second endpoint.
 */
export type CreatedLicense = {
  id: string;
  label: string | null;
  licenseKey: string;
  keyLast4: string;
  applicationId: string;
  expiresAt: Date | null;
  hwidLocked: boolean;
  createdAt: Date;
};

/**
 * Derives the label for one member of a batch.
 *
 * A single license keeps the base label exactly — numbering "Acme Corp" as
 * "Acme Corp 1" when it is the only one would be noise. Beyond one, the index
 * is what makes the rows distinguishable in the export.
 *
 * The base is truncated so the suffix always fits: a 119-character base plus
 * " 100" is 123 characters, which would fail the same length rule the edit
 * dialog enforces and leave the developer with labels they cannot re-save.
 */
function batchLabel(base: string | null, index: number, quantity: number): string | null {
  if (base === null) return null;
  if (quantity === 1) return base;

  const suffix = ` ${index + 1}`;
  const room = LICENSE_LABEL_MAX - suffix.length;
  return `${base.slice(0, room).trimEnd()}${suffix}`;
}

export async function createLicenseBatch(
  db: Database,
  ownerId: string,
  input: CreateBatchInput,
): Promise<CreatedLicense[]> {
  const { quantity } = input;
  if (
    !Number.isInteger(quantity) ||
    quantity < BATCH_QUANTITY_MIN ||
    quantity > BATCH_QUANTITY_MAX
  ) {
    throw new Error(
      `Quantity must be a whole number between ${BATCH_QUANTITY_MIN} and ${BATCH_QUANTITY_MAX}.`,
    );
  }

  const now = new Date();
  // Resolved once, before the transaction opens, so all members of the batch
  // share an instant and a rejected past date costs no database work.
  const expiresAt = resolveExpiresAt(input.expiration, now);
  const generate = input.generateKey ?? generateLicenseKey;

  return db.transaction(async (tx) => {
    // Inside the transaction: ownership is verified against the same snapshot
    // the insert uses, so an application deleted concurrently cannot be written to.
    const [owned] = await tx
      .select({ id: applications.id })
      .from(applications)
      .where(and(eq(applications.id, input.applicationId), eq(applications.ownerId, ownerId)))
      .limit(1);

    if (!owned) throw notFound("Application");

    const created: CreatedLicense[] = [];
    const rows: (typeof licenses.$inferInsert)[] = [];

    for (let index = 0; index < quantity; index += 1) {
      const licenseKey = generate();
      const id = generateLicenseId();
      const label = batchLabel(input.label, index, quantity);

      created.push({
        id,
        label,
        licenseKey,
        keyLast4: licenseKeyLast4(licenseKey),
        applicationId: input.applicationId,
        expiresAt,
        hwidLocked: input.hwidLocked,
        createdAt: now,
      });

      rows.push({
        id,
        applicationId: input.applicationId,
        keyHash: hashLicenseKey(licenseKey, input.secret),
        keyLast4: licenseKeyLast4(licenseKey),
        label,
        notes: input.notes,
        status: "active",
        expiresAt,
        hwidLocked: input.hwidLocked,
        createdAt: now,
        updatedAt: now,
      });
    }

    // One statement for the whole batch. A unique-index violation anywhere in
    // it fails the statement, and the surrounding transaction discards the
    // rest — which is the atomicity guarantee, tested by forcing a collision.
    await tx.insert(licenses).values(rows);

    return created;
  });
}
