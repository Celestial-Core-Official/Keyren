import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDatabase, truncateAll } from "../helpers/db";
import { DEVELOPER_A, DEVELOPER_B, makeLicense, makeApplication } from "../helpers/factories";
import {
  getApplicationBreakdown,
  getExpiringSoon,
  getOverviewStats,
  searchLicensesForOwner,
} from "@/lib/licenses/query";
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

const NOW = new Date("2026-08-16T12:00:00.000Z");
const days = (n: number) => new Date(NOW.getTime() + n * 24 * 60 * 60 * 1000);

describe("getOverviewStats", () => {
  it("reports zeroes for a developer with nothing", async () => {
    const stats = await getOverviewStats(db, DEVELOPER_A, NOW);
    expect(stats).toEqual({
      applications: 0,
      total: 0,
      active: 0,
      expired: 0,
      revoked: 0,
      expiringSoon: 0,
    });
  });

  it("counts an application that has no licenses at all", async () => {
    // A LEFT JOIN that counted rows rather than license ids would report one
    // license here, because the join produces one row with a NULL license.
    await makeApplication(db, { ownerId: DEVELOPER_A });

    const stats = await getOverviewStats(db, DEVELOPER_A, NOW);
    expect(stats.applications).toBe(1);
    expect(stats.total).toBe(0);
  });

  it("separates active, expired and revoked", async () => {
    const application = await makeApplication(db, { ownerId: DEVELOPER_A });
    await makeLicense(db, { applicationId: application.id, expiresAt: null });
    await makeLicense(db, { applicationId: application.id, expiresAt: days(-1) });
    await makeLicense(db, { applicationId: application.id, status: "revoked" });

    const stats = await getOverviewStats(db, DEVELOPER_A, NOW);
    expect(stats.total).toBe(3);
    expect(stats.active).toBe(1);
    expect(stats.expired).toBe(1);
    expect(stats.revoked).toBe(1);
  });

  it("counts only licenses lapsing inside the window as expiring soon", async () => {
    const application = await makeApplication(db, { ownerId: DEVELOPER_A });
    await makeLicense(db, { applicationId: application.id, expiresAt: days(3) });
    await makeLicense(db, { applicationId: application.id, expiresAt: days(29) });
    // Outside the 30-day window.
    await makeLicense(db, { applicationId: application.id, expiresAt: days(45) });
    // Already gone — that is "expired", a different problem with its own count.
    await makeLicense(db, { applicationId: application.id, expiresAt: days(-2) });
    // Permanent licenses never expire and must not be swept in.
    await makeLicense(db, { applicationId: application.id, expiresAt: null });

    const stats = await getOverviewStats(db, DEVELOPER_A, NOW);
    expect(stats.expiringSoon).toBe(2);
    expect(stats.expired).toBe(1);
  });

  it("does not count a revoked license as expiring soon", async () => {
    const application = await makeApplication(db, { ownerId: DEVELOPER_A });
    await makeLicense(db, {
      applicationId: application.id,
      expiresAt: days(5),
      status: "revoked",
    });

    const stats = await getOverviewStats(db, DEVELOPER_A, NOW);
    expect(stats.expiringSoon).toBe(0);
    expect(stats.revoked).toBe(1);
  });

  it("never counts another developer's applications or licenses", async () => {
    const mine = await makeApplication(db, { ownerId: DEVELOPER_A });
    await makeLicense(db, { applicationId: mine.id });

    const theirs = await makeApplication(db, { ownerId: DEVELOPER_B });
    await makeLicense(db, { applicationId: theirs.id });
    await makeLicense(db, { applicationId: theirs.id });

    const stats = await getOverviewStats(db, DEVELOPER_A, NOW);
    expect(stats.applications).toBe(1);
    expect(stats.total).toBe(1);
  });
});

describe("getExpiringSoon", () => {
  it("returns the soonest first", async () => {
    const application = await makeApplication(db, { ownerId: DEVELOPER_A });
    await makeLicense(db, {
      applicationId: application.id,
      expiresAt: days(20),
      label: "later",
    });
    await makeLicense(db, {
      applicationId: application.id,
      expiresAt: days(2),
      label: "sooner",
    });

    const rows = await getExpiringSoon(db, DEVELOPER_A, 5, NOW);
    expect(rows.map((row) => row.label)).toEqual(["sooner", "later"]);
  });

  it("names the application each license belongs to", async () => {
    const application = await makeApplication(db, {
      ownerId: DEVELOPER_A,
      name: "Alpha Tool",
    });
    await makeLicense(db, { applicationId: application.id, expiresAt: days(4) });

    const [row] = await getExpiringSoon(db, DEVELOPER_A, 5, NOW);
    expect(row?.applicationName).toBe("Alpha Tool");
    expect(row?.applicationId).toBe(application.id);
  });

  it("honours the limit", async () => {
    const application = await makeApplication(db, { ownerId: DEVELOPER_A });
    for (const offset of [1, 2, 3, 4, 5]) {
      await makeLicense(db, { applicationId: application.id, expiresAt: days(offset) });
    }

    expect(await getExpiringSoon(db, DEVELOPER_A, 3, NOW)).toHaveLength(3);
  });

  it("excludes expired, revoked, permanent and other developers' licenses", async () => {
    const mine = await makeApplication(db, { ownerId: DEVELOPER_A });
    await makeLicense(db, { applicationId: mine.id, expiresAt: days(-1) });
    await makeLicense(db, { applicationId: mine.id, expiresAt: null });
    await makeLicense(db, {
      applicationId: mine.id,
      expiresAt: days(3),
      status: "revoked",
    });

    const theirs = await makeApplication(db, { ownerId: DEVELOPER_B });
    await makeLicense(db, { applicationId: theirs.id, expiresAt: days(3) });

    expect(await getExpiringSoon(db, DEVELOPER_A, 10, NOW)).toEqual([]);
  });
});

describe("getApplicationBreakdown", () => {
  it("lists each application with its totals, busiest first", async () => {
    const quiet = await makeApplication(db, { ownerId: DEVELOPER_A, name: "Quiet" });
    const busy = await makeApplication(db, { ownerId: DEVELOPER_A, name: "Busy" });
    await makeLicense(db, { applicationId: quiet.id });
    for (const offset of [1, 2, 3]) {
      await makeLicense(db, { applicationId: busy.id, label: `busy-${offset}` });
    }

    const rows = await getApplicationBreakdown(db, DEVELOPER_A, NOW);
    expect(rows.map((row) => row.name)).toEqual(["Busy", "Quiet"]);
    expect(rows[0]?.total).toBe(3);
    expect(rows[1]?.total).toBe(1);
  });

  it("includes an application with no licenses, counted as zero", async () => {
    await makeApplication(db, { ownerId: DEVELOPER_A, name: "Empty" });

    const rows = await getApplicationBreakdown(db, DEVELOPER_A, NOW);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.total).toBe(0);
    expect(rows[0]?.active).toBe(0);
  });

  it("excludes expired licenses from the active figure", async () => {
    const application = await makeApplication(db, { ownerId: DEVELOPER_A });
    await makeLicense(db, { applicationId: application.id, expiresAt: null });
    await makeLicense(db, { applicationId: application.id, expiresAt: days(-1) });

    const [row] = await getApplicationBreakdown(db, DEVELOPER_A, NOW);
    expect(row?.total).toBe(2);
    expect(row?.active).toBe(1);
  });

  it("reports whether an application is disabled", async () => {
    await makeApplication(db, {
      ownerId: DEVELOPER_A,
      name: "Off",
      disabledAt: new Date("2026-08-01T00:00:00.000Z"),
    });

    const [row] = await getApplicationBreakdown(db, DEVELOPER_A, NOW);
    expect(row?.disabled).toBe(true);
  });

  it("never includes another developer's applications", async () => {
    await makeApplication(db, { ownerId: DEVELOPER_B });
    expect(await getApplicationBreakdown(db, DEVELOPER_A, NOW)).toEqual([]);
  });
});

describe("searchLicensesForOwner", () => {
  it("finds a license by the last four characters of its key", async () => {
    // The case this exists for: a customer sends a key suffix and the
    // developer should not have to work out which application it belongs to.
    const application = await makeApplication(db, { ownerId: DEVELOPER_A });
    const license = await makeLicense(db, { applicationId: application.id });
    const last4 = license.plaintextKey.slice(-4);

    const hits = await searchLicensesForOwner(db, DEVELOPER_A, last4);
    expect(hits.map((hit) => hit.id)).toContain(license.id);
    expect(hits[0]?.keyLast4).toBe(last4);
  });

  it("finds a license by label, across applications", async () => {
    const first = await makeApplication(db, { ownerId: DEVELOPER_A, name: "One" });
    const second = await makeApplication(db, { ownerId: DEVELOPER_A, name: "Two" });
    await makeLicense(db, { applicationId: first.id, label: "Acme Corp" });
    await makeLicense(db, { applicationId: second.id, label: "Acme Holdings" });

    const hits = await searchLicensesForOwner(db, DEVELOPER_A, "Acme");
    expect(hits).toHaveLength(2);
    expect(hits.map((hit) => hit.applicationName).sort()).toEqual(["One", "Two"]);
  });

  it("never returns another developer's licenses", async () => {
    const theirs = await makeApplication(db, { ownerId: DEVELOPER_B });
    await makeLicense(db, { applicationId: theirs.id, label: "Acme Corp" });

    expect(await searchLicensesForOwner(db, DEVELOPER_A, "Acme")).toEqual([]);
  });

  it("treats a wildcard as a literal rather than matching everything", async () => {
    const application = await makeApplication(db, { ownerId: DEVELOPER_A });
    await makeLicense(db, { applicationId: application.id, label: "50% off" });
    await makeLicense(db, { applicationId: application.id, label: "Full price" });

    const hits = await searchLicensesForOwner(db, DEVELOPER_A, "50%");
    expect(hits).toHaveLength(1);
    expect(hits[0]?.label).toBe("50% off");
  });

  it("returns nothing for an empty term rather than the whole table", async () => {
    const application = await makeApplication(db, { ownerId: DEVELOPER_A });
    await makeLicense(db, { applicationId: application.id, label: "Acme" });

    expect(await searchLicensesForOwner(db, DEVELOPER_A, "   ")).toEqual([]);
  });
});
