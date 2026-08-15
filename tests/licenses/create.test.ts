import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { licenses } from "@/db/schema";
import { createTestDatabase, TEST_HMAC_SECRET, truncateAll } from "../helpers/db";
import { DEVELOPER_A, DEVELOPER_B, makeProduct } from "../helpers/factories";
import { createLicense, listLicenses } from "@/lib/licenses/service";
import { LICENSE_KEY_PATTERN, hashLicenseKey } from "@/lib/crypto/license-key";
import type { Database } from "@/db/types";

let db: Database;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDatabase());
});
afterAll(async () => {
  await close();
});
beforeEach(async () => {
  await truncateAll(db);
});

describe("createLicense", () => {
  it("returns the plaintext key exactly once, in the creation response", async () => {
    const product = await makeProduct(db, { ownerId: DEVELOPER_A });
    const created = await createLicense(db, DEVELOPER_A, {
      productId: product.id,
      expiration: { mode: "permanent" },
      hwidLocked: true,
      secret: TEST_HMAC_SECRET,
    });

    expect(created.plaintextKey).toMatch(LICENSE_KEY_PATTERN);
  });

  it("never persists the plaintext key", async () => {
    const product = await makeProduct(db, { ownerId: DEVELOPER_A });
    const created = await createLicense(db, DEVELOPER_A, {
      productId: product.id,
      expiration: { mode: "permanent" },
      hwidLocked: true,
      secret: TEST_HMAC_SECRET,
    });

    // Scan every column of the stored row for the plaintext, in any casing.
    const [row] = await db.select().from(licenses).where(eq(licenses.id, created.license.id));
    const serialized = JSON.stringify(row).toUpperCase();
    expect(serialized).not.toContain(created.plaintextKey.toUpperCase());

    // What IS stored is the keyed digest.
    expect(row?.keyHash).toBe(hashLicenseKey(created.plaintextKey, TEST_HMAC_SECRET));
  });

  it("stores the last four characters for masked display", async () => {
    const product = await makeProduct(db, { ownerId: DEVELOPER_A });
    const created = await createLicense(db, DEVELOPER_A, {
      productId: product.id,
      expiration: { mode: "permanent" },
      hwidLocked: true,
      secret: TEST_HMAC_SECRET,
    });

    expect(created.license.keyLast4).toBe(created.plaintextKey.slice(-4));
  });

  it("defaults to active, HWID-locked, never expiring", async () => {
    const product = await makeProduct(db, { ownerId: DEVELOPER_A });
    const created = await createLicense(db, DEVELOPER_A, {
      productId: product.id,
      expiration: { mode: "permanent" },
      hwidLocked: true,
      secret: TEST_HMAC_SECRET,
    });

    expect(created.license.status).toBe("active");
    expect(created.license.hwidLocked).toBe(true);
    expect(created.license.expiresAt).toBeNull();
  });

  it("resolves a duration into an absolute expiry", async () => {
    const product = await makeProduct(db, { ownerId: DEVELOPER_A });
    const created = await createLicense(db, DEVELOPER_A, {
      productId: product.id,
      expiration: { mode: "duration", duration: "30d" },
      hwidLocked: false,
      secret: TEST_HMAC_SECRET,
    });

    const expected = Date.now() + 30 * 24 * 60 * 60 * 1000;
    expect(created.license.expiresAt).not.toBeNull();
    expect(Math.abs(created.license.expiresAt!.getTime() - expected)).toBeLessThan(5000);
  });

  it("refuses to create a license under another developer's product", async () => {
    const product = await makeProduct(db, { ownerId: DEVELOPER_B });
    await expect(
      createLicense(db, DEVELOPER_A, {
        productId: product.id,
        expiration: { mode: "permanent" },
        hwidLocked: true,
        secret: TEST_HMAC_SECRET,
      }),
    ).rejects.toThrow(/not found/i);

    expect(await db.select().from(licenses)).toHaveLength(0);
  });
});

describe("listLicenses", () => {
  it("returns masked references and never a key hash", async () => {
    const product = await makeProduct(db, { ownerId: DEVELOPER_A });
    const created = await createLicense(db, DEVELOPER_A, {
      productId: product.id,
      expiration: { mode: "permanent" },
      hwidLocked: true,
      secret: TEST_HMAC_SECRET,
    });

    const listed = await listLicenses(db, DEVELOPER_A, product.id);
    expect(listed).toHaveLength(1);

    const serialized = JSON.stringify(listed);
    expect(serialized).not.toContain(created.plaintextKey);
    // The lookup digest is a server-side secret derivative; it must not reach
    // the dashboard payload either.
    expect(serialized).not.toContain(hashLicenseKey(created.plaintextKey, TEST_HMAC_SECRET));
    expect(listed[0]?.keyLast4).toBe(created.plaintextKey.slice(-4));
  });

  it("reports activation state", async () => {
    const product = await makeProduct(db, { ownerId: DEVELOPER_A });
    await createLicense(db, DEVELOPER_A, {
      productId: product.id,
      expiration: { mode: "permanent" },
      hwidLocked: true,
      secret: TEST_HMAC_SECRET,
    });

    const [listed] = await listLicenses(db, DEVELOPER_A, product.id);
    expect(listed?.activation).toBeNull();
  });

  it("refuses to list another developer's licenses", async () => {
    const product = await makeProduct(db, { ownerId: DEVELOPER_B });
    await expect(listLicenses(db, DEVELOPER_A, product.id)).rejects.toThrow(/not found/i);
  });
});
