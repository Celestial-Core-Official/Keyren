import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { activations, licenses } from "@/db/schema";
import { createTestDatabase, truncateAll } from "../helpers/db";
import {
  DEVELOPER_A,
  DEVELOPER_B,
  makeActivation,
  makeLicense,
  makeApplication,
} from "../helpers/factories";
import {
  bulkDeleteLicenses,
  bulkResetActivations,
  bulkRestoreLicenses,
  bulkRevokeLicenses,
  licensesForExport,
} from "@/lib/licenses/bulk";
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

async function statusOf(id: string): Promise<string | undefined> {
  const [row] = await db.select().from(licenses).where(eq(licenses.id, id)).limit(1);
  return row?.status;
}

async function countRows(): Promise<number> {
  return (await db.select().from(licenses)).length;
}

describe("bulkRevokeLicenses", () => {
  it("revokes every eligible license and reports the count", async () => {
    const application = await makeApplication(db, { ownerId: DEVELOPER_A });
    const first = await makeLicense(db, { applicationId: application.id });
    const second = await makeLicense(db, { applicationId: application.id });

    const result = await bulkRevokeLicenses(db, DEVELOPER_A, [first.id, second.id]);

    expect(result.changed).toBe(2);
    expect(await statusOf(first.id)).toBe("revoked");
    expect(await statusOf(second.id)).toBe("revoked");
  });

  it("skips licenses that are already revoked rather than counting them", async () => {
    // "Revoked 5" when three were already revoked is a lie the developer will
    // act on.
    const application = await makeApplication(db, { ownerId: DEVELOPER_A });
    const active = await makeLicense(db, { applicationId: application.id });
    const already = await makeLicense(db, { applicationId: application.id, status: "revoked" });

    const result = await bulkRevokeLicenses(db, DEVELOPER_A, [active.id, already.id]);

    expect(result.changed).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.notFound).toBe(0);
  });

  it("stamps revokedAt on the licenses it changes", async () => {
    const application = await makeApplication(db, { ownerId: DEVELOPER_A });
    const license = await makeLicense(db, { applicationId: application.id });

    await bulkRevokeLicenses(db, DEVELOPER_A, [license.id]);

    const [row] = await db.select().from(licenses).where(eq(licenses.id, license.id));
    expect(row!.revokedAt).toBeInstanceOf(Date);
  });

  it("handles an empty selection without touching anything", async () => {
    const application = await makeApplication(db, { ownerId: DEVELOPER_A });
    await makeLicense(db, { applicationId: application.id });

    expect(await bulkRevokeLicenses(db, DEVELOPER_A, [])).toEqual({
      changed: 0,
      skipped: 0,
      notFound: 0,
    });
  });

  it("counts a repeated id once", async () => {
    const application = await makeApplication(db, { ownerId: DEVELOPER_A });
    const license = await makeLicense(db, { applicationId: application.id });

    const result = await bulkRevokeLicenses(db, DEVELOPER_A, [
      license.id,
      license.id,
      license.id,
    ]);
    expect(result.changed).toBe(1);
  });
});

describe("bulkRestoreLicenses", () => {
  it("restores revoked licenses and skips active ones", async () => {
    const application = await makeApplication(db, { ownerId: DEVELOPER_A });
    const revoked = await makeLicense(db, { applicationId: application.id, status: "revoked" });
    const active = await makeLicense(db, { applicationId: application.id });

    const result = await bulkRestoreLicenses(db, DEVELOPER_A, [revoked.id, active.id]);

    expect(result.changed).toBe(1);
    expect(result.skipped).toBe(1);
    expect(await statusOf(revoked.id)).toBe("active");
  });

  it("clears revokedAt on restore", async () => {
    const application = await makeApplication(db, { ownerId: DEVELOPER_A });
    const license = await makeLicense(db, { applicationId: application.id, status: "revoked" });

    await bulkRestoreLicenses(db, DEVELOPER_A, [license.id]);

    const [row] = await db.select().from(licenses).where(eq(licenses.id, license.id));
    expect(row!.revokedAt).toBeNull();
  });
});

describe("bulkResetActivations", () => {
  it("releases bound licenses and skips unbound ones", async () => {
    const application = await makeApplication(db, { ownerId: DEVELOPER_A });
    const bound = await makeLicense(db, { applicationId: application.id });
    const unbound = await makeLicense(db, { applicationId: application.id });
    await makeActivation(db, { licenseId: bound.id });

    const result = await bulkResetActivations(db, DEVELOPER_A, [bound.id, unbound.id]);

    expect(result.changed).toBe(1);
    expect(result.skipped).toBe(1);
    expect(await db.select().from(activations)).toHaveLength(0);
  });

  it("leaves the licenses themselves untouched", async () => {
    const application = await makeApplication(db, { ownerId: DEVELOPER_A });
    const license = await makeLicense(db, { applicationId: application.id });
    await makeActivation(db, { licenseId: license.id });

    await bulkResetActivations(db, DEVELOPER_A, [license.id]);

    expect(await statusOf(license.id)).toBe("active");
    expect(await countRows()).toBe(1);
  });
});

describe("bulkDeleteLicenses", () => {
  it("erases every selected license", async () => {
    const application = await makeApplication(db, { ownerId: DEVELOPER_A });
    const first = await makeLicense(db, { applicationId: application.id });
    const second = await makeLicense(db, { applicationId: application.id });
    await makeLicense(db, { applicationId: application.id });

    const result = await bulkDeleteLicenses(db, DEVELOPER_A, [first.id, second.id]);

    expect(result.changed).toBe(2);
    expect(await countRows()).toBe(1);
  });

  it("cascades to the activation rows", async () => {
    const application = await makeApplication(db, { ownerId: DEVELOPER_A });
    const license = await makeLicense(db, { applicationId: application.id });
    await makeActivation(db, { licenseId: license.id });

    await bulkDeleteLicenses(db, DEVELOPER_A, [license.id]);

    expect(await db.select().from(activations)).toHaveLength(0);
  });

  it("treats every owned license as eligible", async () => {
    const application = await makeApplication(db, { ownerId: DEVELOPER_A });
    const active = await makeLicense(db, { applicationId: application.id });
    const revoked = await makeLicense(db, { applicationId: application.id, status: "revoked" });

    const result = await bulkDeleteLicenses(db, DEVELOPER_A, [active.id, revoked.id]);
    expect(result.changed).toBe(2);
    expect(result.skipped).toBe(0);
  });
});

describe("bulk operations — authorization", () => {
  it("refuses to touch another developer's licenses", async () => {
    const mine = await makeApplication(db, { ownerId: DEVELOPER_A });
    const theirs = await makeApplication(db, { ownerId: DEVELOPER_B });
    const ours = await makeLicense(db, { applicationId: mine.id });
    const foreign = await makeLicense(db, { applicationId: theirs.id });

    const result = await bulkRevokeLicenses(db, DEVELOPER_A, [ours.id, foreign.id]);

    expect(result.changed).toBe(1);
    expect(result.notFound).toBe(1);
    expect(await statusOf(foreign.id)).toBe("active");
  });

  it("reports a foreign license identically to a missing one", async () => {
    // Otherwise the counts become an oracle for whether a guessed license id
    // belongs to somebody.
    const theirs = await makeApplication(db, { ownerId: DEVELOPER_B });
    const foreign = await makeLicense(db, { applicationId: theirs.id });

    const withForeign = await bulkRevokeLicenses(db, DEVELOPER_A, [foreign.id]);
    const withMissing = await bulkRevokeLicenses(db, DEVELOPER_A, ["lic_nothing"]);

    expect(withForeign).toEqual(withMissing);
  });

  it("refuses to delete another developer's licenses", async () => {
    const theirs = await makeApplication(db, { ownerId: DEVELOPER_B });
    const foreign = await makeLicense(db, { applicationId: theirs.id });

    const result = await bulkDeleteLicenses(db, DEVELOPER_A, [foreign.id]);

    expect(result.changed).toBe(0);
    expect(result.notFound).toBe(1);
    expect(await countRows()).toBe(1);
  });

  it("refuses to reset another developer's activations", async () => {
    const theirs = await makeApplication(db, { ownerId: DEVELOPER_B });
    const foreign = await makeLicense(db, { applicationId: theirs.id });
    await makeActivation(db, { licenseId: foreign.id });

    const result = await bulkResetActivations(db, DEVELOPER_A, [foreign.id]);

    expect(result.changed).toBe(0);
    expect(await db.select().from(activations)).toHaveLength(1);
  });

  it("acts on the owned half of a mixed selection", async () => {
    const mine = await makeApplication(db, { ownerId: DEVELOPER_A });
    const theirs = await makeApplication(db, { ownerId: DEVELOPER_B });
    const ours = [
      await makeLicense(db, { applicationId: mine.id }),
      await makeLicense(db, { applicationId: mine.id }),
    ];
    const foreign = await makeLicense(db, { applicationId: theirs.id });

    const result = await bulkRevokeLicenses(db, DEVELOPER_A, [
      ours[0]!.id,
      foreign.id,
      ours[1]!.id,
      "lic_missing",
    ]);

    expect(result).toEqual({ changed: 2, skipped: 0, notFound: 2 });
  });
});

describe("licensesForExport", () => {
  it("returns metadata for the selected licenses only", async () => {
    const application = await makeApplication(db, { ownerId: DEVELOPER_A });
    const chosen = await makeLicense(db, { applicationId: application.id, label: "Acme Corp" });
    await makeLicense(db, { applicationId: application.id, label: "Not chosen" });

    const rows = await licensesForExport(db, DEVELOPER_A, [chosen.id]);

    expect(rows).toHaveLength(1);
    expect(rows[0]!.label).toBe("Acme Corp");
  });

  it("carries only the masked key, never a plaintext one", async () => {
    const application = await makeApplication(db, { ownerId: DEVELOPER_A });
    const license = await makeLicense(db, { applicationId: application.id });

    const [row] = await licensesForExport(db, DEVELOPER_A, [license.id]);

    expect(row!.maskedKey).toMatch(/^KEYREN-•/);
    expect(JSON.stringify(row)).not.toContain(license.plaintextKey);
    expect(Object.keys(row!)).not.toContain("licenseKey");
    expect(Object.keys(row!)).not.toContain("keyHash");
  });

  it("includes the effective status alongside the stored one", async () => {
    const application = await makeApplication(db, { ownerId: DEVELOPER_A });
    const license = await makeLicense(db, {
      applicationId: application.id,
      expiresAt: new Date("2020-01-01T00:00:00.000Z"),
    });

    const [row] = await licensesForExport(db, DEVELOPER_A, [license.id]);

    expect(row!.status).toBe("active");
    expect(row!.effectiveStatus).toBe("expired");
  });

  it("includes activation timestamps when the license is bound", async () => {
    const application = await makeApplication(db, { ownerId: DEVELOPER_A });
    const license = await makeLicense(db, { applicationId: application.id });
    await makeActivation(db, {
      licenseId: license.id,
      activatedAt: new Date("2026-08-01T00:00:00.000Z"),
      lastSeenAt: new Date("2026-08-10T00:00:00.000Z"),
    });

    const [row] = await licensesForExport(db, DEVELOPER_A, [license.id]);

    expect(row!.activatedAt?.toISOString()).toBe("2026-08-01T00:00:00.000Z");
    expect(row!.lastSeenAt?.toISOString()).toBe("2026-08-10T00:00:00.000Z");
  });

  it("omits another developer's licenses entirely", async () => {
    const theirs = await makeApplication(db, { ownerId: DEVELOPER_B });
    const foreign = await makeLicense(db, { applicationId: theirs.id, label: "Theirs" });

    expect(await licensesForExport(db, DEVELOPER_A, [foreign.id])).toEqual([]);
  });

  it("returns an empty list for an empty selection", async () => {
    expect(await licensesForExport(db, DEVELOPER_A, [])).toEqual([]);
  });
});
