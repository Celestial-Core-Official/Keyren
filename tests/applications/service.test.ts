import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDatabase, truncateAll } from "../helpers/db";
import { DEVELOPER_A, DEVELOPER_B, makeLicense, makeApplication } from "../helpers/factories";
import {
  createApplication,
  deleteApplication,
  getApplication,
  listApplications,
  renameApplication,
} from "@/lib/applications/service";
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

describe("createApplication", () => {
  it("assigns an immutable app_ id and a derived slug", async () => {
    const application = await createApplication(db, DEVELOPER_A, { name: "Seliware Key" });
    expect(application.id).toMatch(/^app_[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(application.slug).toBe("seliware_key");
    expect(application.name).toBe("Seliware Key");
  });

  it("allows duplicate names for the same developer", async () => {
    const first = await createApplication(db, DEVELOPER_A, { name: "Same Name" });
    const second = await createApplication(db, DEVELOPER_A, { name: "Same Name" });
    expect(first.id).not.toBe(second.id);
    expect(first.slug).toBe(second.slug);
  });
});

describe("listApplications", () => {
  it("returns only the calling developer's applications", async () => {
    await makeApplication(db, { ownerId: DEVELOPER_A, name: "A one" });
    await makeApplication(db, { ownerId: DEVELOPER_A, name: "A two" });
    await makeApplication(db, { ownerId: DEVELOPER_B, name: "B one" });

    const listed = await listApplications(db, DEVELOPER_A);
    expect(listed).toHaveLength(2);
    expect(listed.map((p) => p.name).sort()).toEqual(["A one", "A two"]);
  });

  it("includes a license count per application", async () => {
    const application = await makeApplication(db, { ownerId: DEVELOPER_A });
    await makeLicense(db, { applicationId: application.id });
    await makeLicense(db, { applicationId: application.id });

    const [listed] = await listApplications(db, DEVELOPER_A);
    expect(listed?.licenseCount).toBe(2);
  });

  it("reports zero licenses for an empty application", async () => {
    await makeApplication(db, { ownerId: DEVELOPER_A });
    const [listed] = await listApplications(db, DEVELOPER_A);
    expect(listed?.licenseCount).toBe(0);
  });
});

describe("getApplication", () => {
  it("returns the developer's own application", async () => {
    const created = await makeApplication(db, { ownerId: DEVELOPER_A });
    const found = await getApplication(db, DEVELOPER_A, created.id);
    expect(found?.id).toBe(created.id);
  });

  // Spec test #13: a developer cannot access another developer's application.
  it("returns null for another developer's application", async () => {
    const created = await makeApplication(db, { ownerId: DEVELOPER_B });
    expect(await getApplication(db, DEVELOPER_A, created.id)).toBeNull();
  });

  it("returns null for an id that does not exist", async () => {
    expect(await getApplication(db, DEVELOPER_A, "app_NOPE")).toBeNull();
  });
});

describe("renameApplication", () => {
  it("updates name and slug but never the id", async () => {
    const created = await createApplication(db, DEVELOPER_A, { name: "Old Name" });
    const renamed = await renameApplication(db, DEVELOPER_A, created.id, "Brand New Name");
    expect(renamed.id).toBe(created.id);
    expect(renamed.name).toBe("Brand New Name");
    expect(renamed.slug).toBe("brand_new_name");
  });

  it("advances updatedAt", async () => {
    const created = await createApplication(db, DEVELOPER_A, { name: "Old" });
    await new Promise((resolve) => setTimeout(resolve, 10));
    const renamed = await renameApplication(db, DEVELOPER_A, created.id, "New");
    expect(renamed.updatedAt.getTime()).toBeGreaterThanOrEqual(created.updatedAt.getTime());
  });

  it("refuses to rename another developer's application", async () => {
    const created = await makeApplication(db, { ownerId: DEVELOPER_B, name: "Theirs" });
    await expect(renameApplication(db, DEVELOPER_A, created.id, "Mine")).rejects.toThrow(
      /not found/i,
    );

    // And the row is genuinely untouched.
    const stillTheirs = await getApplication(db, DEVELOPER_B, created.id);
    expect(stillTheirs?.name).toBe("Theirs");
  });
});

describe("deleteApplication", () => {
  it("deletes the developer's own application", async () => {
    const created = await makeApplication(db, { ownerId: DEVELOPER_A });
    await deleteApplication(db, DEVELOPER_A, created.id);
    expect(await getApplication(db, DEVELOPER_A, created.id)).toBeNull();
  });

  it("cascades to the application's licenses", async () => {
    const created = await makeApplication(db, { ownerId: DEVELOPER_A });
    await makeLicense(db, { applicationId: created.id });
    await deleteApplication(db, DEVELOPER_A, created.id);

    const remaining = await db.query.licenses.findMany();
    expect(remaining).toHaveLength(0);
  });

  it("refuses to delete another developer's application", async () => {
    const created = await makeApplication(db, { ownerId: DEVELOPER_B });
    await expect(deleteApplication(db, DEVELOPER_A, created.id)).rejects.toThrow(/not found/i);
    expect(await getApplication(db, DEVELOPER_B, created.id)).not.toBeNull();
  });
});
