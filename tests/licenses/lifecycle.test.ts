import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { activations, licenses } from "@/db/schema";
import { createTestDatabase, truncateAll } from "../helpers/db";
import { DEVELOPER_A, DEVELOPER_B, makeLicense, makeApplication } from "../helpers/factories";
import {
  deleteLicense,
  getLicense,
  resetActivation,
  restoreLicense,
  revokeLicense,
} from "@/lib/licenses/service";
import { generateActivationId } from "@/lib/crypto/ids";
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

async function seedActivation(licenseId: string): Promise<void> {
  await db.insert(activations).values({
    id: generateActivationId(),
    licenseId,
    deviceHash: "device-hash-value",
  });
}

describe("revokeLicense", () => {
  it("marks the license revoked and stamps revokedAt", async () => {
    const application = await makeApplication(db, { ownerId: DEVELOPER_A });
    const license = await makeLicense(db, { applicationId: application.id });

    const revoked = await revokeLicense(db, DEVELOPER_A, license.id);
    expect(revoked.status).toBe("revoked");
    expect(revoked.revokedAt).toBeInstanceOf(Date);
  });

  it("does not destroy the record or its activation", async () => {
    const application = await makeApplication(db, { ownerId: DEVELOPER_A });
    const license = await makeLicense(db, { applicationId: application.id });
    await seedActivation(license.id);

    await revokeLicense(db, DEVELOPER_A, license.id);

    expect(await db.select().from(licenses).where(eq(licenses.id, license.id))).toHaveLength(1);
    expect(
      await db.select().from(activations).where(eq(activations.licenseId, license.id)),
    ).toHaveLength(1);
  });
});

describe("restoreLicense", () => {
  it("returns a revoked license to active and clears revokedAt", async () => {
    const application = await makeApplication(db, { ownerId: DEVELOPER_A });
    const license = await makeLicense(db, { applicationId: application.id, status: "revoked" });

    const restored = await restoreLicense(db, DEVELOPER_A, license.id);
    expect(restored.status).toBe("active");
    expect(restored.revokedAt).toBeNull();
  });

  it("is idempotent on an already-active license", async () => {
    const application = await makeApplication(db, { ownerId: DEVELOPER_A });
    const license = await makeLicense(db, { applicationId: application.id });

    const restored = await restoreLicense(db, DEVELOPER_A, license.id);
    expect(restored.status).toBe("active");
  });
});

describe("resetActivation", () => {
  it("removes the existing device binding", async () => {
    const application = await makeApplication(db, { ownerId: DEVELOPER_A });
    const license = await makeLicense(db, { applicationId: application.id });
    await seedActivation(license.id);

    await resetActivation(db, DEVELOPER_A, license.id);

    expect(
      await db.select().from(activations).where(eq(activations.licenseId, license.id)),
    ).toHaveLength(0);
  });

  it("leaves the license itself active and intact", async () => {
    const application = await makeApplication(db, { ownerId: DEVELOPER_A });
    const license = await makeLicense(db, { applicationId: application.id });
    await seedActivation(license.id);

    await resetActivation(db, DEVELOPER_A, license.id);

    const view = await getLicense(db, DEVELOPER_A, license.id);
    expect(view?.status).toBe("active");
    expect(view?.activation).toBeNull();
  });

  it("succeeds on a license that was never activated", async () => {
    const application = await makeApplication(db, { ownerId: DEVELOPER_A });
    const license = await makeLicense(db, { applicationId: application.id });

    // The developer's intent is "this license should be claimable", and it
    // already is, so resetting nothing is a success rather than an error.
    const view = await resetActivation(db, DEVELOPER_A, license.id);
    expect(view.id).toBe(license.id);
    expect(view.activation).toBeNull();
  });

  it("returns the license so the caller can name what it reset", async () => {
    // Without this the action would need a second lookup purely to build a
    // confirmation message.
    const application = await makeApplication(db, { ownerId: DEVELOPER_A });
    const license = await makeLicense(db, { applicationId: application.id, label: "Acme Corp" });
    await seedActivation(license.id);

    const view = await resetActivation(db, DEVELOPER_A, license.id);
    expect(view.label).toBe("Acme Corp");
  });
});

describe("deleteLicense", () => {
  it("permanently removes the license and cascades to its activation", async () => {
    const application = await makeApplication(db, { ownerId: DEVELOPER_A });
    const license = await makeLicense(db, { applicationId: application.id });
    await seedActivation(license.id);

    await deleteLicense(db, DEVELOPER_A, license.id);

    expect(await db.select().from(licenses).where(eq(licenses.id, license.id))).toHaveLength(0);
    expect(
      await db.select().from(activations).where(eq(activations.licenseId, license.id)),
    ).toHaveLength(0);
  });
});

// Spec test #14: a developer cannot mutate another developer's license.
// This runs the full mutation surface against a foreign license and asserts
// that every single one refuses AND leaves the row untouched.
describe("cross-developer isolation", () => {
  async function foreignLicense(): Promise<string> {
    const application = await makeApplication(db, { ownerId: DEVELOPER_B });
    const license = await makeLicense(db, { applicationId: application.id });
    return license.id;
  }

  it("refuses to read another developer's license", async () => {
    expect(await getLicense(db, DEVELOPER_A, await foreignLicense())).toBeNull();
  });

  it("refuses to revoke another developer's license", async () => {
    const id = await foreignLicense();
    await expect(revokeLicense(db, DEVELOPER_A, id)).rejects.toThrow(/not found/i);
    expect((await getLicense(db, DEVELOPER_B, id))?.status).toBe("active");
  });

  it("refuses to restore another developer's license", async () => {
    const application = await makeApplication(db, { ownerId: DEVELOPER_B });
    const license = await makeLicense(db, { applicationId: application.id, status: "revoked" });
    await expect(restoreLicense(db, DEVELOPER_A, license.id)).rejects.toThrow(/not found/i);
    expect((await getLicense(db, DEVELOPER_B, license.id))?.status).toBe("revoked");
  });

  it("refuses to reset another developer's activation", async () => {
    const id = await foreignLicense();
    await seedActivation(id);
    await expect(resetActivation(db, DEVELOPER_A, id)).rejects.toThrow(/not found/i);
    expect(await db.select().from(activations).where(eq(activations.licenseId, id))).toHaveLength(1);
  });

  it("refuses to delete another developer's license", async () => {
    const id = await foreignLicense();
    await expect(deleteLicense(db, DEVELOPER_A, id)).rejects.toThrow(/not found/i);
    expect(await getLicense(db, DEVELOPER_B, id)).not.toBeNull();
  });
});
