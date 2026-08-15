import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { licenses } from "@/db/schema";
import { createTestDatabase, TEST_HMAC_SECRET, truncateAll } from "../helpers/db";
import { DEVELOPER_A, DEVELOPER_B, makeProduct } from "../helpers/factories";
import { createLicenseBatch } from "@/lib/licenses/batch";
import { generateLicenseKey, hashLicenseKey } from "@/lib/crypto/license-key";
import { BATCH_QUANTITY_MAX } from "@/lib/licenses/types";
import { createLicenseSchema } from "@/lib/validation/dashboard";
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

async function batch(
  productId: string,
  overrides: Partial<Parameters<typeof createLicenseBatch>[2]> = {},
) {
  return createLicenseBatch(db, DEVELOPER_A, {
    productId,
    quantity: 1,
    expiration: { mode: "permanent" },
    hwidLocked: true,
    secret: TEST_HMAC_SECRET,
    label: null,
    notes: null,
    ...overrides,
  });
}

async function countRows(productId: string): Promise<number> {
  const rows = await db.select().from(licenses).where(eq(licenses.productId, productId));
  return rows.length;
}

describe("createLicenseBatch — quantity bounds", () => {
  it("creates exactly one license for quantity 1", async () => {
    const product = await makeProduct(db, { ownerId: DEVELOPER_A });

    const result = await batch(product.id, { quantity: 1 });
    expect(result).toHaveLength(1);
    expect(await countRows(product.id)).toBe(1);
  });

  it("creates exactly 100 licenses for the maximum quantity", async () => {
    const product = await makeProduct(db, { ownerId: DEVELOPER_A });

    const result = await batch(product.id, { quantity: BATCH_QUANTITY_MAX });
    expect(result).toHaveLength(100);
    expect(await countRows(product.id)).toBe(100);
  });

  it("refuses quantity 0", async () => {
    const product = await makeProduct(db, { ownerId: DEVELOPER_A });

    await expect(batch(product.id, { quantity: 0 })).rejects.toThrow();
    expect(await countRows(product.id)).toBe(0);
  });

  it("refuses quantity 101", async () => {
    const product = await makeProduct(db, { ownerId: DEVELOPER_A });

    await expect(batch(product.id, { quantity: 101 })).rejects.toThrow();
    expect(await countRows(product.id)).toBe(0);
  });

  it("refuses a fractional quantity", async () => {
    const product = await makeProduct(db, { ownerId: DEVELOPER_A });

    await expect(batch(product.id, { quantity: 2.5 })).rejects.toThrow();
    expect(await countRows(product.id)).toBe(0);
  });
});

describe("createLicenseBatch — validation schema bounds", () => {
  const base = { productId: "prod_abc", mode: "permanent" as const, hwidLocked: true };

  it("accepts 1 through 100", () => {
    expect(createLicenseSchema.safeParse({ ...base, quantity: 1 }).success).toBe(true);
    expect(createLicenseSchema.safeParse({ ...base, quantity: 100 }).success).toBe(true);
  });

  it("rejects 0 and 101", () => {
    expect(createLicenseSchema.safeParse({ ...base, quantity: 0 }).success).toBe(false);
    expect(createLicenseSchema.safeParse({ ...base, quantity: 101 }).success).toBe(false);
  });

  it("defaults to a quantity of 1", () => {
    const parsed = createLicenseSchema.safeParse(base);
    expect(parsed.success).toBe(true);
    expect(parsed.data && "quantity" in parsed.data && parsed.data.quantity).toBe(1);
  });

  it("coerces the string a form submits", () => {
    const parsed = createLicenseSchema.safeParse({ ...base, quantity: "5" });
    expect(parsed.success).toBe(true);
    expect(parsed.data && "quantity" in parsed.data && parsed.data.quantity).toBe(5);
  });
});

describe("createLicenseBatch — labels", () => {
  it("preserves the base label exactly for a single license", async () => {
    const product = await makeProduct(db, { ownerId: DEVELOPER_A });

    const result = await batch(product.id, { quantity: 1, label: "Acme Corp" });
    expect(result[0]?.label).toBe("Acme Corp");
  });

  it("suffixes labels with a 1-based index for a batch", async () => {
    const product = await makeProduct(db, { ownerId: DEVELOPER_A });

    const result = await batch(product.id, { quantity: 3, label: "Acme Corp" });
    expect(result.map((row) => row.label)).toEqual([
      "Acme Corp 1",
      "Acme Corp 2",
      "Acme Corp 3",
    ]);
  });

  it("leaves labels null when no base label is given", async () => {
    const product = await makeProduct(db, { ownerId: DEVELOPER_A });

    const result = await batch(product.id, { quantity: 3, label: null });
    expect(result.every((row) => row.label === null)).toBe(true);
  });

  it("keeps a suffixed label inside the 120-character column limit", async () => {
    // A 119-character base plus " 100" would be 123 and fail the same
    // validation the edit dialog enforces.
    const product = await makeProduct(db, { ownerId: DEVELOPER_A });

    const result = await batch(product.id, {
      quantity: 100,
      label: "L".repeat(119),
    });

    expect(result.every((row) => (row.label?.length ?? 0) <= 120)).toBe(true);
    expect(result.at(-1)?.label?.endsWith(" 100")).toBe(true);
  });

  it("applies the same notes to every license in the batch", async () => {
    const product = await makeProduct(db, { ownerId: DEVELOPER_A });

    await batch(product.id, { quantity: 3, notes: "Bulk order, March." });
    const rows = await db.select().from(licenses).where(eq(licenses.productId, product.id));

    expect(rows.every((row) => row.notes === "Bulk order, March.")).toBe(true);
  });
});

describe("createLicenseBatch — shared settings", () => {
  it("applies one expiration to the whole batch", async () => {
    const product = await makeProduct(db, { ownerId: DEVELOPER_A });
    const expiresAt = new Date("2027-01-01T23:59:59.999Z");

    const result = await batch(product.id, {
      quantity: 5,
      expiration: { mode: "date", expiresAt },
    });

    expect(
      result.every((row) => row.expiresAt?.getTime() === expiresAt.getTime()),
    ).toBe(true);
  });

  it("applies one device-lock setting to the whole batch", async () => {
    const product = await makeProduct(db, { ownerId: DEVELOPER_A });

    const result = await batch(product.id, { quantity: 4, hwidLocked: false });
    expect(result.every((row) => row.hwidLocked === false)).toBe(true);
  });

  it("rejects a past expiration date before creating anything", async () => {
    const product = await makeProduct(db, { ownerId: DEVELOPER_A });

    await expect(
      batch(product.id, {
        quantity: 5,
        expiration: { mode: "date", expiresAt: new Date("2020-01-01T00:00:00.000Z") },
      }),
    ).rejects.toThrow(/future/i);

    expect(await countRows(product.id)).toBe(0);
  });
});

describe("createLicenseBatch — keys", () => {
  it("returns a distinct plaintext key for every license", async () => {
    const product = await makeProduct(db, { ownerId: DEVELOPER_A });

    const result = await batch(product.id, { quantity: 50 });
    expect(new Set(result.map((row) => row.licenseKey)).size).toBe(50);
  });

  it("stores a distinct hash for every license and never the plaintext", async () => {
    const product = await makeProduct(db, { ownerId: DEVELOPER_A });

    const result = await batch(product.id, { quantity: 10 });
    const rows = await db.select().from(licenses).where(eq(licenses.productId, product.id));

    expect(new Set(rows.map((row) => row.keyHash)).size).toBe(10);

    // Nothing in any column may contain a plaintext key.
    const serialized = JSON.stringify(rows);
    for (const created of result) {
      expect(serialized).not.toContain(created.licenseKey);
    }
  });

  it("stores a hash that verifies against the returned plaintext", async () => {
    const product = await makeProduct(db, { ownerId: DEVELOPER_A });

    const result = await batch(product.id, { quantity: 3 });
    const rows = await db.select().from(licenses).where(eq(licenses.productId, product.id));
    const hashes = new Set(rows.map((row) => row.keyHash));

    for (const created of result) {
      expect(hashes.has(hashLicenseKey(created.licenseKey, TEST_HMAC_SECRET))).toBe(true);
    }
  });

  it("records the correct last four characters for each key", async () => {
    const product = await makeProduct(db, { ownerId: DEVELOPER_A });

    const result = await batch(product.id, { quantity: 5 });
    for (const created of result) {
      expect(created.licenseKey.endsWith(created.keyLast4)).toBe(true);
    }
  });
});

describe("createLicenseBatch — atomicity", () => {
  it("creates none of the batch when a key collides part-way through", async () => {
    // The unique index on key_hash is a tripwire that will never fire at 160
    // bits of entropy. Forcing it is the only honest way to prove the whole
    // batch rolls back rather than leaving a partial run behind.
    const product = await makeProduct(db, { ownerId: DEVELOPER_A });
    const duplicate = generateLicenseKey();
    let issued = 0;

    await expect(
      batch(product.id, {
        quantity: 10,
        // Keys 1-4 are unique; 5 and 6 are identical.
        generateKey: () => {
          issued += 1;
          return issued >= 5 ? duplicate : generateLicenseKey();
        },
      }),
    ).rejects.toThrow();

    expect(await countRows(product.id)).toBe(0);
  });

  it("leaves existing licenses untouched when a batch fails", async () => {
    const product = await makeProduct(db, { ownerId: DEVELOPER_A });
    await batch(product.id, { quantity: 2, label: "Existing" });

    const duplicate = generateLicenseKey();
    await expect(
      batch(product.id, { quantity: 5, generateKey: () => duplicate }),
    ).rejects.toThrow();

    expect(await countRows(product.id)).toBe(2);
  });

  it("rolls back when the generator throws mid-batch", async () => {
    const product = await makeProduct(db, { ownerId: DEVELOPER_A });
    let issued = 0;

    await expect(
      batch(product.id, {
        quantity: 20,
        generateKey: () => {
          issued += 1;
          if (issued === 12) throw new Error("entropy source unavailable");
          return generateLicenseKey();
        },
      }),
    ).rejects.toThrow(/entropy/);

    expect(await countRows(product.id)).toBe(0);
  });
});

describe("createLicenseBatch — ownership", () => {
  it("refuses a product owned by another developer", async () => {
    const product = await makeProduct(db, { ownerId: DEVELOPER_B });

    await expect(
      createLicenseBatch(db, DEVELOPER_A, {
        productId: product.id,
        quantity: 5,
        expiration: { mode: "permanent" },
        hwidLocked: true,
        secret: TEST_HMAC_SECRET,
        label: null,
        notes: null,
      }),
    ).rejects.toThrow(/not found/i);

    expect(await countRows(product.id)).toBe(0);
  });

  it("reports a missing product identically to a foreign one", async () => {
    await expect(
      createLicenseBatch(db, DEVELOPER_A, {
        productId: "prod_nothing",
        quantity: 1,
        expiration: { mode: "permanent" },
        hwidLocked: true,
        secret: TEST_HMAC_SECRET,
        label: null,
        notes: null,
      }),
    ).rejects.toThrow(/not found/i);
  });
});
