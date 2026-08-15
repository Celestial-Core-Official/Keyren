import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDatabase, TEST_HMAC_SECRET, truncateAll } from "../helpers/db";
import { DEVELOPER_A, makeLicense, makeProduct } from "../helpers/factories";
import { verifyLicense } from "@/lib/licenses/verify";
import { restoreLicense, revokeLicense } from "@/lib/licenses/service";
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

async function verify(productId: string, key: string, now?: Date) {
  return verifyLicense(db, {
    productId,
    licenseKey: key,
    deviceId: DEVICE,
    secret: TEST_HMAC_SECRET,
    ...(now ? { now } : {}),
  });
}

// Spec test #4
describe("revoked license", () => {
  it("returns LICENSE_REVOKED", async () => {
    const product = await makeProduct(db, { ownerId: DEVELOPER_A });
    const license = await makeLicense(db, { productId: product.id });
    await revokeLicense(db, DEVELOPER_A, license.id);

    const result = await verify(product.id, license.plaintextKey);
    expect(result.success).toBe(false);
    if (result.success) throw new Error("expected failure");
    expect(result.error.code).toBe("LICENSE_REVOKED");
  });

  it("reports revoked rather than expired when both are true", async () => {
    // Revocation is the developer's deliberate act, so it is the more useful
    // signal to surface.
    const product = await makeProduct(db, { ownerId: DEVELOPER_A });
    const license = await makeLicense(db, {
      productId: product.id,
      expiresAt: new Date("2020-01-01T00:00:00.000Z"),
    });
    await revokeLicense(db, DEVELOPER_A, license.id);

    const result = await verify(product.id, license.plaintextKey);
    if (result.success) throw new Error("expected failure");
    expect(result.error.code).toBe("LICENSE_REVOKED");
  });
});

// Spec test #5
describe("restored license", () => {
  it("authenticates again after being restored", async () => {
    const product = await makeProduct(db, { ownerId: DEVELOPER_A });
    const license = await makeLicense(db, { productId: product.id });

    await revokeLicense(db, DEVELOPER_A, license.id);
    const whileRevoked = await verify(product.id, license.plaintextKey);
    expect(whileRevoked.success).toBe(false);

    await restoreLicense(db, DEVELOPER_A, license.id);
    const afterRestore = await verify(product.id, license.plaintextKey);
    expect(afterRestore.success).toBe(true);
  });
});

// Spec test #6
describe("expired license", () => {
  it("returns LICENSE_EXPIRED once the deadline has passed", async () => {
    const product = await makeProduct(db, { ownerId: DEVELOPER_A });
    const license = await makeLicense(db, {
      productId: product.id,
      expiresAt: new Date("2026-01-01T00:00:00.000Z"),
    });

    const result = await verify(
      product.id,
      license.plaintextKey,
      new Date("2026-01-02T00:00:00.000Z"),
    );
    if (result.success) throw new Error("expected failure");
    expect(result.error.code).toBe("LICENSE_EXPIRED");
  });

  it("still authenticates one second before the deadline", async () => {
    const product = await makeProduct(db, { ownerId: DEVELOPER_A });
    const license = await makeLicense(db, {
      productId: product.id,
      expiresAt: new Date("2026-01-01T00:00:00.000Z"),
    });

    const result = await verify(
      product.id,
      license.plaintextKey,
      new Date("2025-12-31T23:59:59.000Z"),
    );
    expect(result.success).toBe(true);
  });

  it("returns the expiry as an ISO-8601 UTC string on success", async () => {
    const product = await makeProduct(db, { ownerId: DEVELOPER_A });
    const license = await makeLicense(db, {
      productId: product.id,
      expiresAt: new Date("2027-01-01T00:00:00.000Z"),
    });

    const result = await verify(
      product.id,
      license.plaintextKey,
      new Date("2026-01-01T00:00:00.000Z"),
    );
    if (!result.success) throw new Error("expected success");
    expect(result.license.expiresAt).toBe("2027-01-01T00:00:00.000Z");
  });

  it("ignores the client clock entirely", async () => {
    // The `now` parameter is server-side only; nothing in the request body
    // can influence expiry evaluation.
    const product = await makeProduct(db, { ownerId: DEVELOPER_A });
    const license = await makeLicense(db, {
      productId: product.id,
      expiresAt: new Date("2020-01-01T00:00:00.000Z"),
    });

    const result = await verifyLicense(db, {
      productId: product.id,
      licenseKey: license.plaintextKey,
      deviceId: DEVICE,
      secret: TEST_HMAC_SECRET,
    });
    if (result.success) throw new Error("expected failure");
    expect(result.error.code).toBe("LICENSE_EXPIRED");
  });
});

// Spec test #7
describe("permanent license", () => {
  it("authenticates with a null expiry, far into the future", async () => {
    const product = await makeProduct(db, { ownerId: DEVELOPER_A });
    const license = await makeLicense(db, { productId: product.id, expiresAt: null });

    const result = await verify(
      product.id,
      license.plaintextKey,
      new Date("2099-12-31T00:00:00.000Z"),
    );
    if (!result.success) throw new Error("expected success");
    expect(result.license.expiresAt).toBeNull();
    expect(result.license.status).toBe("active");
  });
});
