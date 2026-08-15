import { generateLicenseId, generateProductId } from "@/lib/crypto/ids";
import {
  generateLicenseKey,
  hashLicenseKey,
  licenseKeyLast4,
} from "@/lib/crypto/license-key";
import { licenses, products } from "@/db/schema";
import type { Database } from "@/db/types";
import { TEST_HMAC_SECRET } from "./db";

export const DEVELOPER_A = "user_developer_a";
export const DEVELOPER_B = "user_developer_b";

export async function makeProduct(
  db: Database,
  options: { ownerId?: string; name?: string } = {},
): Promise<{ id: string; ownerId: string; name: string }> {
  const id = generateProductId();
  const ownerId = options.ownerId ?? DEVELOPER_A;
  const name = options.name ?? "Test Product";

  await db.insert(products).values({ id, ownerId, name, slug: "test_product" });

  return { id, ownerId, name };
}

export async function makeLicense(
  db: Database,
  options: {
    productId: string;
    hwidLocked?: boolean;
    expiresAt?: Date | null;
    status?: "active" | "revoked";
    label?: string | null;
    notes?: string | null;
    createdAt?: Date;
  },
): Promise<{ id: string; plaintextKey: string }> {
  const id = generateLicenseId();
  const plaintextKey = generateLicenseKey();

  await db.insert(licenses).values({
    id,
    productId: options.productId,
    keyHash: hashLicenseKey(plaintextKey, TEST_HMAC_SECRET),
    keyLast4: licenseKeyLast4(plaintextKey),
    hwidLocked: options.hwidLocked ?? true,
    expiresAt: options.expiresAt ?? null,
    status: options.status ?? "active",
    label: options.label ?? null,
    notes: options.notes ?? null,
    // Explicit creation times let sort and pagination tests build a
    // deterministic ordering instead of racing the default clock.
    ...(options.createdAt ? { createdAt: options.createdAt, updatedAt: options.createdAt } : {}),
    ...(options.status === "revoked" ? { revokedAt: new Date() } : {}),
  });

  return { id, plaintextKey };
}
