import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDatabase, TEST_HMAC_SECRET, truncateAll } from "../helpers/db";
import { DEVELOPER_A, makeLicense, makeApplication } from "../helpers/factories";
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
    const application = await makeApplication(db, { ownerId: DEVELOPER_A });
    const license = await makeLicense(db, { applicationId: application.id, hwidLocked: true });

    const result = await verifyLicense(db, {
      applicationId: application.id,
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
    const application = await makeApplication(db, { ownerId: DEVELOPER_A });
    const license = await makeLicense(db, { applicationId: application.id });

    const result = await verifyLicense(db, {
      applicationId: application.id,
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
    const application = await makeApplication(db, { ownerId: DEVELOPER_A });

    const result = await verifyLicense(db, {
      applicationId: application.id,
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
    const application = await makeApplication(db, { ownerId: DEVELOPER_A });
    const license = await makeLicense(db, { applicationId: application.id });

    const result = await verifyLicense(db, {
      applicationId: application.id,
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
describe("wrong application", () => {
  it("rejects a real key presented against another application", async () => {
    const applicationOne = await makeApplication(db, { ownerId: DEVELOPER_A, name: "One" });
    const applicationTwo = await makeApplication(db, { ownerId: DEVELOPER_A, name: "Two" });
    const license = await makeLicense(db, { applicationId: applicationOne.id });

    const result = await verifyLicense(db, {
      applicationId: applicationTwo.id,
      licenseKey: license.plaintextKey,
      deviceId: DEVICE,
      secret: TEST_HMAC_SECRET,
    });

    expect(result.success).toBe(false);
    if (result.success) throw new Error("expected failure");
    // Not a distinct "wrong application for this key" code — that would confirm
    // the key exists somewhere, which is exactly what an enumerator wants.
    expect(result.error.code).toBe("LICENSE_INVALID");
  });

  it("returns APPLICATION_INVALID for an unknown application id", async () => {
    const result = await verifyLicense(db, {
      applicationId: "app_DOESNOTEXIST0000000000000",
      licenseKey: generateLicenseKey(),
      deviceId: DEVICE,
      secret: TEST_HMAC_SECRET,
    });

    expect(result.success).toBe(false);
    if (result.success) throw new Error("expected failure");
    // Application IDs ship inside customer software, so distinguishing this case
    // helps an integrating developer without helping an attacker.
    expect(result.error.code).toBe("APPLICATION_INVALID");
  });
});

describe("enumeration resistance", () => {
  it("returns byte-identical responses for absent and foreign licenses", async () => {
    const applicationOne = await makeApplication(db, { ownerId: DEVELOPER_A, name: "One" });
    const applicationTwo = await makeApplication(db, { ownerId: DEVELOPER_A, name: "Two" });
    const realKeyOfAnotherApplication = await makeLicense(db, { applicationId: applicationOne.id });

    const absent = await verifyLicense(db, {
      applicationId: applicationTwo.id,
      licenseKey: generateLicenseKey(),
      deviceId: DEVICE,
      secret: TEST_HMAC_SECRET,
    });
    const foreign = await verifyLicense(db, {
      applicationId: applicationTwo.id,
      licenseKey: realKeyOfAnotherApplication.plaintextKey,
      deviceId: DEVICE,
      secret: TEST_HMAC_SECRET,
    });

    expect(JSON.stringify(absent)).toBe(JSON.stringify(foreign));
  });

  it("never echoes internal identifiers in a failure", async () => {
    const application = await makeApplication(db, { ownerId: DEVELOPER_A });
    const license = await makeLicense(db, { applicationId: application.id, status: "revoked" });

    const result = await verifyLicense(db, {
      applicationId: application.id,
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
