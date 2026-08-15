import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDatabase, truncateAll } from "../helpers/db";
import { DEVELOPER_A, DEVELOPER_B, makeLicense, makeProduct } from "../helpers/factories";
import { listProducts } from "@/lib/products/service";
import { DEFAULT_PRODUCT_QUERY, type ProductQuery } from "@/lib/products/types";
import { parseProductQuery } from "@/lib/validation/dashboard";
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

function query(overrides: Partial<ProductQuery> = {}): ProductQuery {
  return { ...DEFAULT_PRODUCT_QUERY, ...overrides };
}

async function seedCatalogue() {
  // Explicit creation times so "newest" and "oldest" assert an intended order
  // rather than however fast three inserts happened to land.
  const alpha = await makeProduct(db, {
    ownerId: DEVELOPER_A,
    name: "Alpha Editor",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
  });
  const zephyr = await makeProduct(db, {
    ownerId: DEVELOPER_A,
    name: "Zephyr Suite",
    createdAt: new Date("2026-02-01T00:00:00.000Z"),
  });
  const midas = await makeProduct(db, {
    ownerId: DEVELOPER_A,
    name: "Midas Toolkit",
    createdAt: new Date("2026-03-01T00:00:00.000Z"),
  });

  await makeLicense(db, { productId: zephyr.id });
  await makeLicense(db, { productId: zephyr.id });
  await makeLicense(db, { productId: midas.id });

  return { alpha, zephyr, midas };
}

describe("listProducts — search", () => {
  it("returns every product for an empty search", async () => {
    await seedCatalogue();
    expect(await listProducts(db, DEVELOPER_A, query())).toHaveLength(3);
  });

  it("matches a name case-insensitively", async () => {
    const cast = await seedCatalogue();

    const rows = await listProducts(db, DEVELOPER_A, query({ q: "zephyr" }));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(cast.zephyr.id);
  });

  it("matches a slug", async () => {
    await makeProduct(db, { ownerId: DEVELOPER_A, name: "Deep Field Renderer" });

    const rows = await listProducts(db, DEVELOPER_A, query({ q: "deep_field" }));
    expect(rows).toHaveLength(1);
  });

  it("matches a product id exactly as pasted", async () => {
    const cast = await seedCatalogue();

    const rows = await listProducts(db, DEVELOPER_A, query({ q: cast.midas.id }));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(cast.midas.id);
  });

  it("matches a substring of the name", async () => {
    const cast = await seedCatalogue();

    const rows = await listProducts(db, DEVELOPER_A, query({ q: "oolkit" }));
    expect(rows[0]?.id).toBe(cast.midas.id);
  });

  it("treats % as a literal character", async () => {
    await makeProduct(db, { ownerId: DEVELOPER_A, name: "100% Coverage" });
    await makeProduct(db, { ownerId: DEVELOPER_A, name: "Something Else" });

    expect(await listProducts(db, DEVELOPER_A, query({ q: "%" }))).toHaveLength(1);
  });

  it("never returns another developer's products", async () => {
    await makeProduct(db, { ownerId: DEVELOPER_B, name: "Zephyr Suite" });
    await seedCatalogue();

    const rows = await listProducts(db, DEVELOPER_B, query({ q: "zephyr" }));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.licenseCount).toBe(0);
  });

  it("returns an empty list rather than failing when nothing matches", async () => {
    await seedCatalogue();
    expect(await listProducts(db, DEVELOPER_A, query({ q: "nothing here" }))).toEqual([]);
  });
});

describe("listProducts — sorting", () => {
  it("sorts newest first by default", async () => {
    const cast = await seedCatalogue();

    const rows = await listProducts(db, DEVELOPER_A, query({ sort: "newest" }));
    expect(rows[0]?.id).toBe(cast.midas.id);
  });

  it("sorts oldest first", async () => {
    const cast = await seedCatalogue();

    const rows = await listProducts(db, DEVELOPER_A, query({ sort: "oldest" }));
    expect(rows[0]?.id).toBe(cast.alpha.id);
  });

  it("sorts by name alphabetically", async () => {
    await seedCatalogue();

    const rows = await listProducts(db, DEVELOPER_A, query({ sort: "name" }));
    expect(rows.map((row) => row.name)).toEqual([
      "Alpha Editor",
      "Midas Toolkit",
      "Zephyr Suite",
    ]);
  });

  it("sorts by license count, busiest first", async () => {
    const cast = await seedCatalogue();

    const rows = await listProducts(db, DEVELOPER_A, query({ sort: "licenses" }));
    expect(rows.map((row) => row.id)).toEqual([cast.zephyr.id, cast.midas.id, cast.alpha.id]);
    expect(rows.map((row) => row.licenseCount)).toEqual([2, 1, 0]);
  });

  it("still counts licenses correctly when a search is applied", async () => {
    const cast = await seedCatalogue();

    const rows = await listProducts(db, DEVELOPER_A, query({ q: "zephyr" }));
    expect(rows[0]?.licenseCount).toBe(2);
    expect(rows[0]?.id).toBe(cast.zephyr.id);
  });

  it("keeps listing usable with no arguments at all", async () => {
    // The overview page just wants everything; it should not have to build a
    // query object to ask.
    await seedCatalogue();
    expect(await listProducts(db, DEVELOPER_A)).toHaveLength(3);
  });
});

describe("parseProductQuery", () => {
  it("returns defaults for an empty query string", () => {
    expect(parseProductQuery({})).toEqual(DEFAULT_PRODUCT_QUERY);
  });

  it("reads the supported parameters", () => {
    expect(parseProductQuery({ q: "  zephyr  ", sort: "name" })).toEqual({
      q: "zephyr",
      sort: "name",
    });
  });

  it("falls back for an unknown sort", () => {
    expect(parseProductQuery({ sort: "byVibes" }).sort).toBe("newest");
  });

  it("takes the first value when a parameter repeats", () => {
    expect(parseProductQuery({ sort: ["name", "oldest"] }).sort).toBe("name");
  });
});
