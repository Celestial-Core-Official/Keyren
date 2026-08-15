import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDatabase, truncateAll } from "../helpers/db";
import { DEVELOPER_A, DEVELOPER_B, makeLicense, makeProduct } from "../helpers/factories";
import {
  createProduct,
  deleteProduct,
  getProduct,
  listProducts,
  renameProduct,
} from "@/lib/products/service";
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

describe("createProduct", () => {
  it("assigns an immutable prod_ id and a derived slug", async () => {
    const product = await createProduct(db, DEVELOPER_A, { name: "Seliware Key" });
    expect(product.id).toMatch(/^prod_[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(product.slug).toBe("seliware_key");
    expect(product.name).toBe("Seliware Key");
  });

  it("allows duplicate names for the same developer", async () => {
    const first = await createProduct(db, DEVELOPER_A, { name: "Same Name" });
    const second = await createProduct(db, DEVELOPER_A, { name: "Same Name" });
    expect(first.id).not.toBe(second.id);
    expect(first.slug).toBe(second.slug);
  });
});

describe("listProducts", () => {
  it("returns only the calling developer's products", async () => {
    await makeProduct(db, { ownerId: DEVELOPER_A, name: "A one" });
    await makeProduct(db, { ownerId: DEVELOPER_A, name: "A two" });
    await makeProduct(db, { ownerId: DEVELOPER_B, name: "B one" });

    const listed = await listProducts(db, DEVELOPER_A);
    expect(listed).toHaveLength(2);
    expect(listed.map((p) => p.name).sort()).toEqual(["A one", "A two"]);
  });

  it("includes a license count per product", async () => {
    const product = await makeProduct(db, { ownerId: DEVELOPER_A });
    await makeLicense(db, { productId: product.id });
    await makeLicense(db, { productId: product.id });

    const [listed] = await listProducts(db, DEVELOPER_A);
    expect(listed?.licenseCount).toBe(2);
  });

  it("reports zero licenses for an empty product", async () => {
    await makeProduct(db, { ownerId: DEVELOPER_A });
    const [listed] = await listProducts(db, DEVELOPER_A);
    expect(listed?.licenseCount).toBe(0);
  });
});

describe("getProduct", () => {
  it("returns the developer's own product", async () => {
    const created = await makeProduct(db, { ownerId: DEVELOPER_A });
    const found = await getProduct(db, DEVELOPER_A, created.id);
    expect(found?.id).toBe(created.id);
  });

  // Spec test #13: a developer cannot access another developer's product.
  it("returns null for another developer's product", async () => {
    const created = await makeProduct(db, { ownerId: DEVELOPER_B });
    expect(await getProduct(db, DEVELOPER_A, created.id)).toBeNull();
  });

  it("returns null for an id that does not exist", async () => {
    expect(await getProduct(db, DEVELOPER_A, "prod_NOPE")).toBeNull();
  });
});

describe("renameProduct", () => {
  it("updates name and slug but never the id", async () => {
    const created = await createProduct(db, DEVELOPER_A, { name: "Old Name" });
    const renamed = await renameProduct(db, DEVELOPER_A, created.id, "Brand New Name");
    expect(renamed.id).toBe(created.id);
    expect(renamed.name).toBe("Brand New Name");
    expect(renamed.slug).toBe("brand_new_name");
  });

  it("advances updatedAt", async () => {
    const created = await createProduct(db, DEVELOPER_A, { name: "Old" });
    await new Promise((resolve) => setTimeout(resolve, 10));
    const renamed = await renameProduct(db, DEVELOPER_A, created.id, "New");
    expect(renamed.updatedAt.getTime()).toBeGreaterThanOrEqual(created.updatedAt.getTime());
  });

  it("refuses to rename another developer's product", async () => {
    const created = await makeProduct(db, { ownerId: DEVELOPER_B, name: "Theirs" });
    await expect(renameProduct(db, DEVELOPER_A, created.id, "Mine")).rejects.toThrow(
      /not found/i,
    );

    // And the row is genuinely untouched.
    const stillTheirs = await getProduct(db, DEVELOPER_B, created.id);
    expect(stillTheirs?.name).toBe("Theirs");
  });
});

describe("deleteProduct", () => {
  it("deletes the developer's own product", async () => {
    const created = await makeProduct(db, { ownerId: DEVELOPER_A });
    await deleteProduct(db, DEVELOPER_A, created.id);
    expect(await getProduct(db, DEVELOPER_A, created.id)).toBeNull();
  });

  it("cascades to the product's licenses", async () => {
    const created = await makeProduct(db, { ownerId: DEVELOPER_A });
    await makeLicense(db, { productId: created.id });
    await deleteProduct(db, DEVELOPER_A, created.id);

    const remaining = await db.query.licenses.findMany();
    expect(remaining).toHaveLength(0);
  });

  it("refuses to delete another developer's product", async () => {
    const created = await makeProduct(db, { ownerId: DEVELOPER_B });
    await expect(deleteProduct(db, DEVELOPER_A, created.id)).rejects.toThrow(/not found/i);
    expect(await getProduct(db, DEVELOPER_B, created.id)).not.toBeNull();
  });
});
