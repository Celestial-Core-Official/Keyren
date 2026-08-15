import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDatabase, truncateAll } from "../helpers/db";
import {
  DEVELOPER_A,
  DEVELOPER_B,
  makeActivation,
  makeLicense,
  makeProduct,
} from "../helpers/factories";
import { getProductLicenseStats, queryLicenses } from "@/lib/licenses/query";
import { DEFAULT_LICENSE_QUERY, type LicenseQuery } from "@/lib/licenses/types";
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

const NOW = new Date("2026-06-15T12:00:00.000Z");
const PAST = new Date("2026-01-01T00:00:00.000Z");
const SOON = new Date("2026-07-01T00:00:00.000Z");
const LATER = new Date("2027-01-01T00:00:00.000Z");

function at(iso: string): Date {
  return new Date(iso);
}

function query(overrides: Partial<LicenseQuery> = {}): LicenseQuery {
  return { ...DEFAULT_LICENSE_QUERY, ...overrides };
}

/**
 * A fixed cast covering every dimension the dashboard can filter on, so each
 * test asserts against a known population rather than building its own.
 */
async function seedCast(productId: string) {
  const permanent = await makeLicense(db, {
    productId,
    label: "Acme Corp",
    notes: "Paid by invoice",
    createdAt: at("2026-05-01T00:00:00.000Z"),
    hwidLocked: true,
  });
  const expired = await makeLicense(db, {
    productId,
    label: "Beta Tester",
    expiresAt: PAST,
    createdAt: at("2026-05-02T00:00:00.000Z"),
    hwidLocked: true,
  });
  const revoked = await makeLicense(db, {
    productId,
    label: "Chargeback",
    status: "revoked",
    createdAt: at("2026-05-03T00:00:00.000Z"),
    hwidLocked: false,
  });
  const expiringSoon = await makeLicense(db, {
    productId,
    label: "Delta Trial",
    expiresAt: SOON,
    createdAt: at("2026-05-04T00:00:00.000Z"),
    hwidLocked: false,
  });
  const unlabeled = await makeLicense(db, {
    productId,
    expiresAt: LATER,
    createdAt: at("2026-05-05T00:00:00.000Z"),
    hwidLocked: true,
  });

  // Only two of the five are bound to a device.
  await makeActivation(db, {
    licenseId: permanent.id,
    lastSeenAt: at("2026-06-10T00:00:00.000Z"),
  });
  await makeActivation(db, {
    licenseId: expiringSoon.id,
    lastSeenAt: at("2026-06-14T00:00:00.000Z"),
  });

  return { permanent, expired, revoked, expiringSoon, unlabeled };
}

async function run(productId: string, overrides: Partial<LicenseQuery> = {}) {
  return queryLicenses(db, DEVELOPER_A, productId, query(overrides), NOW);
}

describe("queryLicenses — ownership", () => {
  it("refuses a product owned by another developer", async () => {
    const product = await makeProduct(db, { ownerId: DEVELOPER_B });
    await makeLicense(db, { productId: product.id });

    await expect(
      queryLicenses(db, DEVELOPER_A, product.id, query(), NOW),
    ).rejects.toThrow(/not found/i);
  });

  it("reports a missing product identically to a foreign one", async () => {
    await expect(
      queryLicenses(db, DEVELOPER_A, "prod_nothing", query(), NOW),
    ).rejects.toThrow(/not found/i);
  });

  it("never returns licenses belonging to another developer's product", async () => {
    const mine = await makeProduct(db, { ownerId: DEVELOPER_A });
    const theirs = await makeProduct(db, { ownerId: DEVELOPER_B });
    await makeLicense(db, { productId: mine.id, label: "Mine" });
    await makeLicense(db, { productId: theirs.id, label: "Theirs" });

    const result = await run(mine.id);
    expect(result.total).toBe(1);
    expect(result.rows[0]?.label).toBe("Mine");
  });
});

describe("queryLicenses — effective status", () => {
  it("marks an active license past its expiry as expired", async () => {
    const product = await makeProduct(db, { ownerId: DEVELOPER_A });
    const cast = await seedCast(product.id);

    const result = await run(product.id);
    const byId = new Map(result.rows.map((row) => [row.id, row.effectiveStatus]));

    expect(byId.get(cast.permanent.id)).toBe("active");
    expect(byId.get(cast.expired.id)).toBe("expired");
    expect(byId.get(cast.revoked.id)).toBe("revoked");
    expect(byId.get(cast.expiringSoon.id)).toBe("active");
  });

  it("keeps a revoked-and-expired license classified as revoked", async () => {
    // Revocation is the developer's deliberate act; expiry is the calendar.
    // The deliberate one is the more useful thing to show.
    const product = await makeProduct(db, { ownerId: DEVELOPER_A });
    await makeLicense(db, {
      productId: product.id,
      status: "revoked",
      expiresAt: PAST,
    });

    const result = await run(product.id);
    expect(result.rows[0]?.effectiveStatus).toBe("revoked");
  });
});

describe("queryLicenses — status filter", () => {
  it("returns everything for 'all'", async () => {
    const product = await makeProduct(db, { ownerId: DEVELOPER_A });
    await seedCast(product.id);

    expect((await run(product.id, { status: "all" })).total).toBe(5);
  });

  it("excludes expired and revoked from 'active'", async () => {
    const product = await makeProduct(db, { ownerId: DEVELOPER_A });
    const cast = await seedCast(product.id);

    const result = await run(product.id, { status: "active" });
    expect(result.total).toBe(3);
    expect(result.rows.map((row) => row.id).sort()).toEqual(
      [cast.permanent.id, cast.expiringSoon.id, cast.unlabeled.id].sort(),
    );
  });

  it("returns only revoked for 'revoked'", async () => {
    const product = await makeProduct(db, { ownerId: DEVELOPER_A });
    const cast = await seedCast(product.id);

    const result = await run(product.id, { status: "revoked" });
    expect(result.total).toBe(1);
    expect(result.rows[0]?.id).toBe(cast.revoked.id);
  });

  it("returns only expired for 'expired'", async () => {
    const product = await makeProduct(db, { ownerId: DEVELOPER_A });
    const cast = await seedCast(product.id);

    const result = await run(product.id, { status: "expired" });
    expect(result.total).toBe(1);
    expect(result.rows[0]?.id).toBe(cast.expired.id);
  });
});

describe("queryLicenses — activation filter", () => {
  it("returns only bound licenses for 'activated'", async () => {
    const product = await makeProduct(db, { ownerId: DEVELOPER_A });
    const cast = await seedCast(product.id);

    const result = await run(product.id, { activation: "activated" });
    expect(result.total).toBe(2);
    expect(result.rows.map((row) => row.id).sort()).toEqual(
      [cast.permanent.id, cast.expiringSoon.id].sort(),
    );
  });

  it("returns only unbound licenses for 'unactivated'", async () => {
    const product = await makeProduct(db, { ownerId: DEVELOPER_A });
    await seedCast(product.id);

    const result = await run(product.id, { activation: "unactivated" });
    expect(result.total).toBe(3);
    expect(result.rows.every((row) => row.activation === null)).toBe(true);
  });
});

describe("queryLicenses — lock filter", () => {
  it("returns only device-locked licenses for 'locked'", async () => {
    const product = await makeProduct(db, { ownerId: DEVELOPER_A });
    await seedCast(product.id);

    const result = await run(product.id, { lock: "locked" });
    expect(result.total).toBe(3);
    expect(result.rows.every((row) => row.hwidLocked)).toBe(true);
  });

  it("returns only unlocked licenses for 'unlocked'", async () => {
    const product = await makeProduct(db, { ownerId: DEVELOPER_A });
    await seedCast(product.id);

    const result = await run(product.id, { lock: "unlocked" });
    expect(result.total).toBe(2);
    expect(result.rows.every((row) => !row.hwidLocked)).toBe(true);
  });
});

describe("queryLicenses — search", () => {
  it("matches a label case-insensitively", async () => {
    const product = await makeProduct(db, { ownerId: DEVELOPER_A });
    const cast = await seedCast(product.id);

    const result = await run(product.id, { q: "acme" });
    expect(result.total).toBe(1);
    expect(result.rows[0]?.id).toBe(cast.permanent.id);
  });

  it("matches notes", async () => {
    const product = await makeProduct(db, { ownerId: DEVELOPER_A });
    const cast = await seedCast(product.id);

    const result = await run(product.id, { q: "INVOICE" });
    expect(result.total).toBe(1);
    expect(result.rows[0]?.id).toBe(cast.permanent.id);
  });

  it("matches the last four characters of the key", async () => {
    const product = await makeProduct(db, { ownerId: DEVELOPER_A });
    const license = await makeLicense(db, { productId: product.id });

    const [row] = (await run(product.id)).rows;
    const result = await run(product.id, { q: row!.keyLast4.toLowerCase() });

    expect(result.rows.some((candidate) => candidate.id === license.id)).toBe(true);
  });

  it("matches a substring rather than only a prefix", async () => {
    const product = await makeProduct(db, { ownerId: DEVELOPER_A });
    await seedCast(product.id);

    expect((await run(product.id, { q: "orp" })).total).toBe(1);
  });

  it("treats % as a literal character, not a wildcard", async () => {
    // Otherwise a developer searching for a discount code matches everything.
    const product = await makeProduct(db, { ownerId: DEVELOPER_A });
    await makeLicense(db, { productId: product.id, label: "50% off" });
    await makeLicense(db, { productId: product.id, label: "full price" });

    expect((await run(product.id, { q: "%" })).total).toBe(1);
    expect((await run(product.id, { q: "50% off" })).total).toBe(1);
  });

  it("treats _ as a literal character, not a single-character wildcard", async () => {
    const product = await makeProduct(db, { ownerId: DEVELOPER_A });
    await makeLicense(db, { productId: product.id, label: "order_9" });
    await makeLicense(db, { productId: product.id, label: "orderX9" });

    expect((await run(product.id, { q: "order_9" })).total).toBe(1);
  });

  it("treats a backslash as a literal character", async () => {
    const product = await makeProduct(db, { ownerId: DEVELOPER_A });
    await makeLicense(db, { productId: product.id, label: "path\\to\\seat" });
    await makeLicense(db, { productId: product.id, label: "unrelated" });

    expect((await run(product.id, { q: "path\\to" })).total).toBe(1);
  });

  it("ignores surrounding whitespace in the search term", async () => {
    const product = await makeProduct(db, { ownerId: DEVELOPER_A });
    await seedCast(product.id);

    expect((await run(product.id, { q: "  acme  " })).total).toBe(1);
  });

  it("returns everything for an empty search", async () => {
    const product = await makeProduct(db, { ownerId: DEVELOPER_A });
    await seedCast(product.id);

    expect((await run(product.id, { q: "" })).total).toBe(5);
    expect((await run(product.id, { q: "   " })).total).toBe(5);
  });

  it("does not match an unlabeled license on its empty label", async () => {
    const product = await makeProduct(db, { ownerId: DEVELOPER_A });
    await seedCast(product.id);

    const result = await run(product.id, { q: "Delta" });
    expect(result.total).toBe(1);
  });
});

describe("queryLicenses — combined filters", () => {
  it("intersects search, status and lock", async () => {
    const product = await makeProduct(db, { ownerId: DEVELOPER_A });
    await seedCast(product.id);

    // "Delta Trial" is active, unlocked and matches "trial".
    expect(
      (await run(product.id, { q: "trial", status: "active", lock: "unlocked" })).total,
    ).toBe(1);

    // Same license, but it is not locked, so this must find nothing.
    expect(
      (await run(product.id, { q: "trial", status: "active", lock: "locked" })).total,
    ).toBe(0);
  });

  it("reports total for the filtered set, not the whole product", async () => {
    const product = await makeProduct(db, { ownerId: DEVELOPER_A });
    await seedCast(product.id);

    const result = await run(product.id, { status: "revoked" });
    expect(result.total).toBe(1);
    expect(result.rows).toHaveLength(1);
  });
});

describe("queryLicenses — sorting", () => {
  it("sorts newest first by default", async () => {
    const product = await makeProduct(db, { ownerId: DEVELOPER_A });
    const cast = await seedCast(product.id);

    const result = await run(product.id, { sort: "newest" });
    expect(result.rows[0]?.id).toBe(cast.unlabeled.id);
    expect(result.rows.at(-1)?.id).toBe(cast.permanent.id);
  });

  it("sorts oldest first", async () => {
    const product = await makeProduct(db, { ownerId: DEVELOPER_A });
    const cast = await seedCast(product.id);

    const result = await run(product.id, { sort: "oldest" });
    expect(result.rows[0]?.id).toBe(cast.permanent.id);
    expect(result.rows.at(-1)?.id).toBe(cast.unlabeled.id);
  });

  it("sorts by label alphabetically with unlabeled licenses last", async () => {
    const product = await makeProduct(db, { ownerId: DEVELOPER_A });
    const cast = await seedCast(product.id);

    const result = await run(product.id, { sort: "label" });
    expect(result.rows.map((row) => row.label)).toEqual([
      "Acme Corp",
      "Beta Tester",
      "Chargeback",
      "Delta Trial",
      null,
    ]);
    expect(result.rows.at(-1)?.id).toBe(cast.unlabeled.id);
  });

  it("sorts by soonest expiry with permanent licenses last", async () => {
    // A permanent license is not "expiring furthest away", it is not expiring
    // at all, so it belongs at the end rather than sorted as a null.
    const product = await makeProduct(db, { ownerId: DEVELOPER_A });
    const cast = await seedCast(product.id);

    const result = await run(product.id, { sort: "expiresSoon" });
    expect(result.rows[0]?.id).toBe(cast.expired.id);
    expect(result.rows[1]?.id).toBe(cast.expiringSoon.id);
    expect(result.rows.at(-1)?.expiresAt).toBeNull();
  });

  it("sorts by most recently seen with never-activated licenses last", async () => {
    const product = await makeProduct(db, { ownerId: DEVELOPER_A });
    const cast = await seedCast(product.id);

    const result = await run(product.id, { sort: "lastSeen" });
    expect(result.rows[0]?.id).toBe(cast.expiringSoon.id);
    expect(result.rows[1]?.id).toBe(cast.permanent.id);
    expect(result.rows.slice(2).every((row) => row.activation === null)).toBe(true);
  });
});

describe("queryLicenses — pagination", () => {
  async function seedNumbered(productId: string, count: number) {
    for (let index = 0; index < count; index += 1) {
      await makeLicense(db, {
        productId,
        label: `Seat ${String(index).padStart(3, "0")}`,
        createdAt: at(`2026-05-01T00:00:${String(index).padStart(2, "0")}.000Z`),
      });
    }
  }

  it("returns the requested page and a stable page count", async () => {
    const product = await makeProduct(db, { ownerId: DEVELOPER_A });
    await seedNumbered(product.id, 30);

    const first = await run(product.id, { page: 1, pageSize: 25 });
    expect(first.rows).toHaveLength(25);
    expect(first.total).toBe(30);
    expect(first.pageCount).toBe(2);

    const second = await run(product.id, { page: 2, pageSize: 25 });
    expect(second.rows).toHaveLength(5);
    expect(second.total).toBe(30);
  });

  it("never repeats or drops a row across pages", async () => {
    const product = await makeProduct(db, { ownerId: DEVELOPER_A });
    await seedNumbered(product.id, 30);

    const first = await run(product.id, { page: 1, pageSize: 25 });
    const second = await run(product.id, { page: 2, pageSize: 25 });
    const seen = new Set([...first.rows, ...second.rows].map((row) => row.id));

    expect(seen.size).toBe(30);
  });

  it("orders deterministically when the sort key ties", async () => {
    // Thirty licenses created in the same instant. Without a tiebreaker,
    // Postgres may return them in any order per query, so a row can appear on
    // both page 1 and page 2 — or on neither.
    const product = await makeProduct(db, { ownerId: DEVELOPER_A });
    const sameInstant = at("2026-05-01T00:00:00.000Z");
    for (let index = 0; index < 30; index += 1) {
      await makeLicense(db, { productId: product.id, createdAt: sameInstant });
    }

    const firstRun = await run(product.id, { pageSize: 25 });
    const secondRun = await run(product.id, { pageSize: 25 });
    expect(firstRun.rows.map((row) => row.id)).toEqual(
      secondRun.rows.map((row) => row.id),
    );

    const pageOne = await run(product.id, { page: 1, pageSize: 25 });
    const pageTwo = await run(product.id, { page: 2, pageSize: 25 });
    expect(new Set([...pageOne.rows, ...pageTwo.rows].map((row) => row.id)).size).toBe(30);
  });

  it("returns an empty page past the end without failing", async () => {
    const product = await makeProduct(db, { ownerId: DEVELOPER_A });
    await seedNumbered(product.id, 3);

    const result = await run(product.id, { page: 9, pageSize: 25 });
    expect(result.rows).toEqual([]);
    expect(result.total).toBe(3);
  });

  it("reports one page for an empty product", async () => {
    const product = await makeProduct(db, { ownerId: DEVELOPER_A });

    const result = await run(product.id);
    expect(result.rows).toEqual([]);
    expect(result.total).toBe(0);
    expect(result.pageCount).toBe(1);
  });
});

describe("getProductLicenseStats", () => {
  it("excludes expired licenses from the active count", async () => {
    // Alpha_v1 counted `status = 'active'`, so a product whose licenses had
    // all lapsed still reported them as active — the one number a developer
    // is most likely to trust at a glance.
    const product = await makeProduct(db, { ownerId: DEVELOPER_A });
    await seedCast(product.id);

    const stats = await getProductLicenseStats(db, DEVELOPER_A, product.id, NOW);
    expect(stats.total).toBe(5);
    expect(stats.active).toBe(3);
    expect(stats.expired).toBe(1);
    expect(stats.revoked).toBe(1);
  });

  it("counts only locked licenses with a binding as bound devices", async () => {
    // An unlocked license with an activation row has merely been seen
    // recently; nothing is pinned to that machine.
    const product = await makeProduct(db, { ownerId: DEVELOPER_A });
    await seedCast(product.id);

    const stats = await getProductLicenseStats(db, DEVELOPER_A, product.id, NOW);
    // Of the two activated licenses, only `permanent` is hwid-locked.
    expect(stats.boundDevices).toBe(1);
  });

  it("agrees with the filtered queries it summarises", async () => {
    const product = await makeProduct(db, { ownerId: DEVELOPER_A });
    await seedCast(product.id);

    const stats = await getProductLicenseStats(db, DEVELOPER_A, product.id, NOW);
    expect(stats.active).toBe((await run(product.id, { status: "active" })).total);
    expect(stats.expired).toBe((await run(product.id, { status: "expired" })).total);
    expect(stats.revoked).toBe((await run(product.id, { status: "revoked" })).total);
  });

  it("returns zeroes for a product with no licenses", async () => {
    const product = await makeProduct(db, { ownerId: DEVELOPER_A });

    expect(await getProductLicenseStats(db, DEVELOPER_A, product.id, NOW)).toEqual({
      total: 0,
      active: 0,
      expired: 0,
      revoked: 0,
      boundDevices: 0,
      activated: 0,
    });
  });

  it("counts any activation as evidence a verification has succeeded", async () => {
    // An activation row is only ever written by a successful verification, so
    // this is what lets onboarding derive "your integration works" from real
    // data instead of a flag somebody has to remember to set. Unlike
    // boundDevices it includes unlocked licenses, which verify successfully
    // without claiming a device.
    const product = await makeProduct(db, { ownerId: DEVELOPER_A });
    await seedCast(product.id);

    const stats = await getProductLicenseStats(db, DEVELOPER_A, product.id, NOW);
    expect(stats.activated).toBe(2);
    expect(stats.boundDevices).toBe(1);
  });

  it("reports no activations for a product nothing has verified against", async () => {
    const product = await makeProduct(db, { ownerId: DEVELOPER_A });
    await makeLicense(db, { productId: product.id });

    expect((await getProductLicenseStats(db, DEVELOPER_A, product.id, NOW)).activated).toBe(0);
  });

  it("refuses a product owned by another developer", async () => {
    const product = await makeProduct(db, { ownerId: DEVELOPER_B });
    await makeLicense(db, { productId: product.id });

    await expect(
      getProductLicenseStats(db, DEVELOPER_A, product.id, NOW),
    ).rejects.toThrow(/not found/i);
  });
});
