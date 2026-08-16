import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { licenses } from "@/db/schema";
import { createTestDatabase, TEST_HMAC_SECRET, truncateAll } from "../helpers/db";
import { DEVELOPER_A, DEVELOPER_B, makeLicense, makeApplication } from "../helpers/factories";
import { getLicense, updateLicenseDetails } from "@/lib/licenses/service";
import { verifyLicense } from "@/lib/licenses/verify";
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

describe("license metadata columns", () => {
  it("defaults label and notes to null", async () => {
    const application = await makeApplication(db, { ownerId: DEVELOPER_A });
    const license = await makeLicense(db, { applicationId: application.id });

    const view = await getLicense(db, DEVELOPER_A, license.id);
    expect(view?.label).toBeNull();
    expect(view?.notes).toBeNull();
  });

  it("round-trips a label and notes through the database", async () => {
    const application = await makeApplication(db, { ownerId: DEVELOPER_A });
    const license = await makeLicense(db, {
      applicationId: application.id,
      label: "Order #4471",
      notes: "Refund window closes in March.",
    });

    const view = await getLicense(db, DEVELOPER_A, license.id);
    expect(view?.label).toBe("Order #4471");
    expect(view?.notes).toBe("Refund window closes in March.");
  });

  it("stores the maximum permitted lengths", async () => {
    const application = await makeApplication(db, { ownerId: DEVELOPER_A });
    const license = await makeLicense(db, {
      applicationId: application.id,
      label: "L".repeat(120),
      notes: "N".repeat(1000),
    });

    const view = await getLicense(db, DEVELOPER_A, license.id);
    expect(view?.label).toHaveLength(120);
    expect(view?.notes).toHaveLength(1000);
  });

  it("stores Unicode without mangling it", async () => {
    const application = await makeApplication(db, { ownerId: DEVELOPER_A });
    const license = await makeLicense(db, {
      applicationId: application.id,
      label: "顧客 — Ünïcode 🔑",
    });

    const view = await getLicense(db, DEVELOPER_A, license.id);
    expect(view?.label).toBe("顧客 — Ünïcode 🔑");
  });
});

describe("updateLicenseDetails", () => {
  it("sets both fields and returns the updated view", async () => {
    const application = await makeApplication(db, { ownerId: DEVELOPER_A });
    const license = await makeLicense(db, { applicationId: application.id });

    const updated = await updateLicenseDetails(db, DEVELOPER_A, license.id, {
      label: "Acme Corp",
      notes: "Enterprise pilot.",
    });

    expect(updated.label).toBe("Acme Corp");
    expect(updated.notes).toBe("Enterprise pilot.");
  });

  it("clears a field when given null", async () => {
    const application = await makeApplication(db, { ownerId: DEVELOPER_A });
    const license = await makeLicense(db, {
      applicationId: application.id,
      label: "Temporary",
      notes: "Delete me",
    });

    const updated = await updateLicenseDetails(db, DEVELOPER_A, license.id, {
      label: null,
      notes: null,
    });

    expect(updated.label).toBeNull();
    expect(updated.notes).toBeNull();
  });

  it("bumps updatedAt", async () => {
    const application = await makeApplication(db, { ownerId: DEVELOPER_A });
    const license = await makeLicense(db, { applicationId: application.id });

    const [before] = await db
      .select()
      .from(licenses)
      .where(eq(licenses.id, license.id))
      .limit(1);

    await new Promise((resolve) => setTimeout(resolve, 5));
    const updated = await updateLicenseDetails(db, DEVELOPER_A, license.id, {
      label: "Touched",
      notes: null,
    });

    expect(updated.updatedAt.getTime()).toBeGreaterThan(before!.updatedAt.getTime());
  });

  it("never changes the key hash, status or expiry", async () => {
    const application = await makeApplication(db, { ownerId: DEVELOPER_A });
    const expiresAt = new Date(Date.now() + 86_400_000);
    const license = await makeLicense(db, {
      applicationId: application.id,
      status: "revoked",
      expiresAt,
    });

    const [before] = await db
      .select()
      .from(licenses)
      .where(eq(licenses.id, license.id))
      .limit(1);

    await updateLicenseDetails(db, DEVELOPER_A, license.id, {
      label: "Renamed",
      notes: null,
    });

    const [after] = await db
      .select()
      .from(licenses)
      .where(eq(licenses.id, license.id))
      .limit(1);

    expect(after!.keyHash).toBe(before!.keyHash);
    expect(after!.keyLast4).toBe(before!.keyLast4);
    expect(after!.status).toBe("revoked");
    expect(after!.expiresAt?.getTime()).toBe(before!.expiresAt?.getTime());
  });

  it("refuses to edit a license owned by another developer", async () => {
    const application = await makeApplication(db, { ownerId: DEVELOPER_A });
    const license = await makeLicense(db, { applicationId: application.id });

    await expect(
      updateLicenseDetails(db, DEVELOPER_B, license.id, {
        label: "Stolen",
        notes: null,
      }),
    ).rejects.toThrow(/not found/i);

    // And the row is untouched, not merely the response suppressed.
    const [row] = await db
      .select()
      .from(licenses)
      .where(eq(licenses.id, license.id))
      .limit(1);
    expect(row!.label).toBeNull();
  });

  it("reports a missing license identically to a foreign one", async () => {
    await expect(
      updateLicenseDetails(db, DEVELOPER_A, "lic_doesnotexist", {
        label: "x",
        notes: null,
      }),
    ).rejects.toThrow(/not found/i);
  });
});

describe("public verification response", () => {
  it("never discloses the label or notes", async () => {
    // These are internal commercial context — a customer name, an order
    // reference, a private remark. The verification endpoint is unauthenticated
    // and anyone holding the key can call it, so the response envelope stays
    // exactly `{ status, expiresAt }`.
    const application = await makeApplication(db, { ownerId: DEVELOPER_A });
    const license = await makeLicense(db, {
      applicationId: application.id,
      label: "Acme Corp — invoice 8891",
      notes: "Chargeback risk, watch this one.",
    });

    const result = await verifyLicense(db, {
      applicationId: application.id,
      licenseKey: license.plaintextKey,
      deviceId: "device-under-test",
      secret: TEST_HMAC_SECRET,
    });

    expect(result.success).toBe(true);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("Acme");
    expect(serialized).not.toContain("Chargeback");
    expect(serialized).not.toContain("label");
    expect(serialized).not.toContain("notes");
    expect(result.success && Object.keys(result.license).sort()).toEqual([
      "expiresAt",
      "status",
    ]);
  });
});
