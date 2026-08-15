import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDatabase, TEST_HMAC_SECRET, truncateAll } from "../helpers/db";
import { DEVELOPER_A, makeLicense, makeProduct } from "../helpers/factories";
import { verifyLicense } from "@/lib/licenses/verify";
import { generateLicenseKey } from "@/lib/crypto/license-key";
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

const DEVICE = "device-fingerprint-one";

// Spec test #1
describe("valid active license", () => {
  it("succeeds and reports active status with a null expiry", async () => {
    const product = await makeProduct(db, { ownerId: DEVELOPER_A });
    const license = await makeLicense(db, { productId: product.id, hwidLocked: true });

    const result = await verifyLicense(db, {
      productId: product.id,
      licenseKey: license.plaintextKey,
      deviceId: DEVICE,
      secret: TEST_HMAC_SECRET,
    });

    expect(result.success).toBe(true);
    if (!result.success) throw new Error("expected success");
    expect(result.license.status).toBe("active");
    expect(result.license.expiresAt).toBeNull();
  });

  it("accepts a lowercase or whitespace-mangled key", async () => {
    const product = await makeProduct(db, { ownerId: DEVELOPER_A });
    const license = await makeLicense(db, { productId: product.id });

    const result = await verifyLicense(db, {
      productId: product.id,
      licenseKey: `  ${license.plaintextKey.toLowerCase()} `,
      deviceId: DEVICE,
      secret: TEST_HMAC_SECRET,
    });

    expect(result.success).toBe(true);
  });
});

// Spec test #2
describe("invalid license", () => {
  it("rejects a well-formed key that was never issued", async () => {
    const product = await makeProduct(db, { ownerId: DEVELOPER_A });

    const result = await verifyLicense(db, {
      productId: product.id,
      licenseKey: generateLicenseKey(),
      deviceId: DEVICE,
      secret: TEST_HMAC_SECRET,
    });

    expect(result.success).toBe(false);
    if (result.success) throw new Error("expected failure");
    expect(result.error.code).toBe("LICENSE_INVALID");
  });

  it("rejects a key hashed under a different server secret", async () => {
    // Simulates a stolen database being replayed against a rotated secret.
    const product = await makeProduct(db, { ownerId: DEVELOPER_A });
    const license = await makeLicense(db, { productId: product.id });

    const result = await verifyLicense(db, {
      productId: product.id,
      licenseKey: license.plaintextKey,
      deviceId: DEVICE,
      secret: "a-completely-different-server-secret-value",
    });

    expect(result.success).toBe(false);
    if (result.success) throw new Error("expected failure");
    expect(result.error.code).toBe("LICENSE_INVALID");
  });
});

// Spec test #3
describe("wrong product", () => {
  it("rejects a real key presented against another product", async () => {
    const productOne = await makeProduct(db, { ownerId: DEVELOPER_A, name: "One" });
    const productTwo = await makeProduct(db, { ownerId: DEVELOPER_A, name: "Two" });
    const license = await makeLicense(db, { productId: productOne.id });

    const result = await verifyLicense(db, {
      productId: productTwo.id,
      licenseKey: license.plaintextKey,
      deviceId: DEVICE,
      secret: TEST_HMAC_SECRET,
    });

    expect(result.success).toBe(false);
    if (result.success) throw new Error("expected failure");
    // Not a distinct "wrong product for this key" code — that would confirm
    // the key exists somewhere, which is exactly what an enumerator wants.
    expect(result.error.code).toBe("LICENSE_INVALID");
  });

  it("returns PRODUCT_INVALID for an unknown product id", async () => {
    const result = await verifyLicense(db, {
      productId: "prod_DOESNOTEXIST0000000000000",
      licenseKey: generateLicenseKey(),
      deviceId: DEVICE,
      secret: TEST_HMAC_SECRET,
    });

    expect(result.success).toBe(false);
    if (result.success) throw new Error("expected failure");
    // Product IDs ship inside customer software, so distinguishing this case
    // helps an integrating developer without helping an attacker.
    expect(result.error.code).toBe("PRODUCT_INVALID");
  });
});

describe("enumeration resistance", () => {
  it("returns byte-identical responses for absent and foreign licenses", async () => {
    const productOne = await makeProduct(db, { ownerId: DEVELOPER_A, name: "One" });
    const productTwo = await makeProduct(db, { ownerId: DEVELOPER_A, name: "Two" });
    const realKeyOfAnotherProduct = await makeLicense(db, { productId: productOne.id });

    const absent = await verifyLicense(db, {
      productId: productTwo.id,
      licenseKey: generateLicenseKey(),
      deviceId: DEVICE,
      secret: TEST_HMAC_SECRET,
    });
    const foreign = await verifyLicense(db, {
      productId: productTwo.id,
      licenseKey: realKeyOfAnotherProduct.plaintextKey,
      deviceId: DEVICE,
      secret: TEST_HMAC_SECRET,
    });

    expect(JSON.stringify(absent)).toBe(JSON.stringify(foreign));
  });

  it("never echoes internal identifiers in a failure", async () => {
    const product = await makeProduct(db, { ownerId: DEVELOPER_A });
    const license = await makeLicense(db, { productId: product.id, status: "revoked" });

    const result = await verifyLicense(db, {
      productId: product.id,
      licenseKey: license.plaintextKey,
      deviceId: DEVICE,
      secret: TEST_HMAC_SECRET,
    });

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(license.id);
    expect(serialized).not.toContain(DEVELOPER_A);
    expect(serialized).not.toContain(license.plaintextKey);
  });
});
