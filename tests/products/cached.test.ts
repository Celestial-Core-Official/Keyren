import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDatabase, truncateAll } from "../helpers/db";
import { DEVELOPER_A, DEVELOPER_B, makeProduct } from "../helpers/factories";
import { getCachedProduct } from "@/lib/products/cached";
import { getProduct } from "@/lib/products/service";
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

/**
 * The layout and the page both call this, each making its own ownership
 * check. The caching is a performance detail; the security properties below
 * are what must hold whether a call is served from cache or not.
 */
describe("getCachedProduct", () => {
  it("returns what the uncached loader returns", async () => {
    const product = await makeProduct(db, { ownerId: DEVELOPER_A, name: "Zephyr Suite" });

    expect(await getCachedProduct(db, DEVELOPER_A, product.id)).toEqual(
      await getProduct(db, DEVELOPER_A, product.id),
    );
  });

  it("still refuses another developer's product", async () => {
    const product = await makeProduct(db, { ownerId: DEVELOPER_A });

    expect(await getCachedProduct(db, DEVELOPER_B, product.id)).toBeNull();
  });

  it("keys on the owner, so one developer's result cannot serve another", async () => {
    // The same product id asked about by two developers must give two
    // different answers, cached or not.
    const product = await makeProduct(db, { ownerId: DEVELOPER_A });

    const mine = await getCachedProduct(db, DEVELOPER_A, product.id);
    const theirs = await getCachedProduct(db, DEVELOPER_B, product.id);

    expect(mine?.id).toBe(product.id);
    expect(theirs).toBeNull();

    // And in the other order, in case a first call could poison a second.
    const theirsFirst = await getCachedProduct(db, DEVELOPER_B, "prod_nothing");
    const mineSecond = await getCachedProduct(db, DEVELOPER_A, product.id);
    expect(theirsFirst).toBeNull();
    expect(mineSecond?.id).toBe(product.id);
  });

  it("returns null for a product that does not exist", async () => {
    expect(await getCachedProduct(db, DEVELOPER_A, "prod_nothing")).toBeNull();
  });
});
