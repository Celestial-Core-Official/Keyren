import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { activations } from "@/db/schema";
import { createTestDatabase, TEST_HMAC_SECRET, truncateAll } from "../helpers/db";
import { DEVELOPER_A, makeLicense, makeProduct } from "../helpers/factories";
import { verifyLicense } from "@/lib/licenses/verify";
import { deleteLicense, resetActivation } from "@/lib/licenses/service";
import { hashDeviceId } from "@/lib/crypto/device";
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

const DEVICE_ONE = "device-fingerprint-one";
const DEVICE_TWO = "device-fingerprint-two";

async function verify(productId: string, key: string, deviceId: string) {
  return verifyLicense(db, {
    productId,
    licenseKey: key,
    deviceId,
    secret: TEST_HMAC_SECRET,
  });
}

// Spec test #8
describe("first HWID activation", () => {
  it("binds the first device and creates an activation record", async () => {
    const product = await makeProduct(db, { ownerId: DEVELOPER_A });
    const license = await makeLicense(db, { productId: product.id, hwidLocked: true });

    const result = await verify(product.id, license.plaintextKey, DEVICE_ONE);
    expect(result.success).toBe(true);

    const rows = await db.select().from(activations).where(eq(activations.licenseId, license.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.deviceHash).toBe(hashDeviceId(DEVICE_ONE, TEST_HMAC_SECRET));
  });

  it("stores only the hashed fingerprint, never the raw value", async () => {
    const product = await makeProduct(db, { ownerId: DEVELOPER_A });
    const license = await makeLicense(db, { productId: product.id, hwidLocked: true });
    await verify(product.id, license.plaintextKey, DEVICE_ONE);

    const rows = await db.select().from(activations);
    expect(JSON.stringify(rows)).not.toContain(DEVICE_ONE);
  });
});

// Spec test #9
describe("same HWID authenticates again", () => {
  it("accepts repeat authentication and advances lastSeenAt", async () => {
    const product = await makeProduct(db, { ownerId: DEVELOPER_A });
    const license = await makeLicense(db, { productId: product.id, hwidLocked: true });

    await verify(product.id, license.plaintextKey, DEVICE_ONE);
    const [first] = await db.select().from(activations).where(eq(activations.licenseId, license.id));

    await new Promise((resolve) => setTimeout(resolve, 15));

    const second = await verify(product.id, license.plaintextKey, DEVICE_ONE);
    expect(second.success).toBe(true);

    const [after] = await db.select().from(activations).where(eq(activations.licenseId, license.id));
    expect(after?.lastSeenAt.getTime()).toBeGreaterThan(first!.lastSeenAt.getTime());
    // The original claim time is preserved across check-ins.
    expect(after?.activatedAt.getTime()).toBe(first!.activatedAt.getTime());
  });

  it("does not create a second activation row", async () => {
    const product = await makeProduct(db, { ownerId: DEVELOPER_A });
    const license = await makeLicense(db, { productId: product.id, hwidLocked: true });

    await verify(product.id, license.plaintextKey, DEVICE_ONE);
    await verify(product.id, license.plaintextKey, DEVICE_ONE);
    await verify(product.id, license.plaintextKey, DEVICE_ONE);

    expect(await db.select().from(activations)).toHaveLength(1);
  });
});

// Spec test #10
describe("different HWID fails", () => {
  it("returns DEVICE_MISMATCH for a second device", async () => {
    const product = await makeProduct(db, { ownerId: DEVELOPER_A });
    const license = await makeLicense(db, { productId: product.id, hwidLocked: true });

    await verify(product.id, license.plaintextKey, DEVICE_ONE);
    const result = await verify(product.id, license.plaintextKey, DEVICE_TWO);

    expect(result.success).toBe(false);
    if (result.success) throw new Error("expected failure");
    expect(result.error.code).toBe("DEVICE_MISMATCH");
  });

  it("leaves the original binding untouched after a rejected attempt", async () => {
    const product = await makeProduct(db, { ownerId: DEVELOPER_A });
    const license = await makeLicense(db, { productId: product.id, hwidLocked: true });

    await verify(product.id, license.plaintextKey, DEVICE_ONE);
    await verify(product.id, license.plaintextKey, DEVICE_TWO);

    const [row] = await db.select().from(activations).where(eq(activations.licenseId, license.id));
    expect(row?.deviceHash).toBe(hashDeviceId(DEVICE_ONE, TEST_HMAC_SECRET));
  });

  it("still admits the original device afterwards", async () => {
    const product = await makeProduct(db, { ownerId: DEVELOPER_A });
    const license = await makeLicense(db, { productId: product.id, hwidLocked: true });

    await verify(product.id, license.plaintextKey, DEVICE_ONE);
    await verify(product.id, license.plaintextKey, DEVICE_TWO);
    const again = await verify(product.id, license.plaintextKey, DEVICE_ONE);

    expect(again.success).toBe(true);
  });
});

describe("licenses without HWID locking", () => {
  it("accepts any device", async () => {
    const product = await makeProduct(db, { ownerId: DEVELOPER_A });
    const license = await makeLicense(db, { productId: product.id, hwidLocked: false });

    expect((await verify(product.id, license.plaintextKey, DEVICE_ONE)).success).toBe(true);
    expect((await verify(product.id, license.plaintextKey, DEVICE_TWO)).success).toBe(true);
  });

  it("tracks the most recently seen device in a single row", async () => {
    const product = await makeProduct(db, { ownerId: DEVELOPER_A });
    const license = await makeLicense(db, { productId: product.id, hwidLocked: false });

    await verify(product.id, license.plaintextKey, DEVICE_ONE);
    await verify(product.id, license.plaintextKey, DEVICE_TWO);

    const rows = await db.select().from(activations).where(eq(activations.licenseId, license.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.deviceHash).toBe(hashDeviceId(DEVICE_TWO, TEST_HMAC_SECRET));
  });
});

// Spec tests #11 and #12
describe("activation reset", () => {
  it("clears the binding and lets a new device claim the license", async () => {
    const product = await makeProduct(db, { ownerId: DEVELOPER_A });
    const license = await makeLicense(db, { productId: product.id, hwidLocked: true });

    await verify(product.id, license.plaintextKey, DEVICE_ONE);
    expect((await verify(product.id, license.plaintextKey, DEVICE_TWO)).success).toBe(false);

    await resetActivation(db, DEVELOPER_A, license.id);

    const afterReset = await verify(product.id, license.plaintextKey, DEVICE_TWO);
    expect(afterReset.success).toBe(true);

    const [row] = await db.select().from(activations).where(eq(activations.licenseId, license.id));
    expect(row?.deviceHash).toBe(hashDeviceId(DEVICE_TWO, TEST_HMAC_SECRET));
  });

  it("locks out the previously bound device once a new one claims it", async () => {
    const product = await makeProduct(db, { ownerId: DEVELOPER_A });
    const license = await makeLicense(db, { productId: product.id, hwidLocked: true });

    await verify(product.id, license.plaintextKey, DEVICE_ONE);
    await resetActivation(db, DEVELOPER_A, license.id);
    await verify(product.id, license.plaintextKey, DEVICE_TWO);

    const result = await verify(product.id, license.plaintextKey, DEVICE_ONE);
    expect(result.success).toBe(false);
    if (result.success) throw new Error("expected failure");
    expect(result.error.code).toBe("DEVICE_MISMATCH");
  });
});

// Spec test #15
describe("deleted license", () => {
  it("can no longer authenticate", async () => {
    const product = await makeProduct(db, { ownerId: DEVELOPER_A });
    const license = await makeLicense(db, { productId: product.id, hwidLocked: true });

    expect((await verify(product.id, license.plaintextKey, DEVICE_ONE)).success).toBe(true);

    await deleteLicense(db, DEVELOPER_A, license.id);

    const result = await verify(product.id, license.plaintextKey, DEVICE_ONE);
    expect(result.success).toBe(false);
    if (result.success) throw new Error("expected failure");
    // Indistinguishable from a key that never existed.
    expect(result.error.code).toBe("LICENSE_INVALID");
  });
});
