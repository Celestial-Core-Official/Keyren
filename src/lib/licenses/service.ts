import { and, desc, eq } from "drizzle-orm";
import { activations, licenses, products } from "@/db/schema";
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
  productId: string;
  keyLast4: string;
  status: "active" | "revoked";
  expiresAt: Date | null;
  hwidLocked: boolean;
  createdAt: Date;
  updatedAt: Date;
  revokedAt: Date | null;
  activation: { activatedAt: Date; lastSeenAt: Date } | null;
};

export type CreateLicenseInput = {
  productId: string;
  expiration: ExpirationInput;
  hwidLocked: boolean;
  secret: string;
};

/**
 * Confirms the product exists AND belongs to this developer, in one query.
 * Every license operation funnels through this, which is what makes the
 * `Clerk user -> owns product -> product owns license` chain unskippable.
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

export async function createLicense(
  db: Database,
  ownerId: string,
  input: CreateLicenseInput,
): Promise<{ license: LicenseView; plaintextKey: string }> {
  await assertOwnsProduct(db, ownerId, input.productId);

  const now = new Date();
  const plaintextKey = generateLicenseKey();
  const expiresAt = resolveExpiresAt(input.expiration, now);

  const [row] = await db
    .insert(licenses)
    .values({
      id: generateLicenseId(),
      productId: input.productId,
      // The plaintext is hashed here and then only ever returned to the
      // caller. It is not logged, not cached, and not written anywhere.
      keyHash: hashLicenseKey(plaintextKey, input.secret),
      keyLast4: licenseKeyLast4(plaintextKey),
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
  productId: string,
): Promise<LicenseView[]> {
  await assertOwnsProduct(db, ownerId, productId);

  const rows = await db
    .select({ license: licenses, activation: activations })
    .from(licenses)
    .leftJoin(activations, eq(activations.licenseId, licenses.id))
    .where(eq(licenses.productId, productId))
    .orderBy(desc(licenses.createdAt));

  return rows.map((row) => toLicenseView(row.license, row.activation));
}

export function toLicenseView(
  row: typeof licenses.$inferSelect,
  activation: typeof activations.$inferSelect | null,
): LicenseView {
  return {
    id: row.id,
    productId: row.productId,
    keyLast4: row.keyLast4,
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
