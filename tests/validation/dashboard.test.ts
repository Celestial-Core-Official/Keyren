import { describe, expect, it } from "vitest";
import {
  createLicenseSchema,
  createProductSchema,
  licenseIdSchema,
  productIdSchema,
  renameProductSchema,
} from "@/lib/validation/dashboard";

describe("createProductSchema", () => {
  it("accepts a reasonable name", () => {
    expect(createProductSchema.safeParse({ name: "Seliware Key" }).success).toBe(true);
  });

  it("trims surrounding whitespace", () => {
    expect(createProductSchema.parse({ name: "  Spaced  " }).name).toBe("Spaced");
  });

  it("rejects an empty or whitespace-only name", () => {
    expect(createProductSchema.safeParse({ name: "" }).success).toBe(false);
    expect(createProductSchema.safeParse({ name: "   " }).success).toBe(false);
  });

  it("rejects an oversized name", () => {
    expect(createProductSchema.safeParse({ name: "x".repeat(201) }).success).toBe(false);
  });

  it("ignores an ownerId supplied by the client", () => {
    // Ownership comes from Clerk, never from the browser. Even if a crafted
    // request carries one, it must not survive parsing.
    const parsed = createProductSchema.parse({ name: "Ok", ownerId: "user_attacker" });
    expect(parsed).not.toHaveProperty("ownerId");
  });
});

describe("renameProductSchema", () => {
  it("requires both a product id and a name", () => {
    expect(
      renameProductSchema.safeParse({ productId: "prod_ABC", name: "New" }).success,
    ).toBe(true);
    expect(renameProductSchema.safeParse({ name: "New" }).success).toBe(false);
  });
});

describe("id schemas", () => {
  it("requires the prod_ prefix", () => {
    expect(productIdSchema.safeParse("prod_ABC123").success).toBe(true);
    expect(productIdSchema.safeParse("lic_ABC123").success).toBe(false);
  });

  it("requires the lic_ prefix", () => {
    expect(licenseIdSchema.safeParse("lic_ABC123").success).toBe(true);
    expect(licenseIdSchema.safeParse("prod_ABC123").success).toBe(false);
  });
});

describe("createLicenseSchema", () => {
  const base = { productId: "prod_ABC123", hwidLocked: true };

  it("accepts permanent", () => {
    expect(createLicenseSchema.safeParse({ ...base, mode: "permanent" }).success).toBe(true);
  });

  it("accepts a duration from the allowed set", () => {
    expect(
      createLicenseSchema.safeParse({ ...base, mode: "duration", duration: "30d" }).success,
    ).toBe(true);
  });

  it("rejects a duration outside the allowed set", () => {
    expect(
      createLicenseSchema.safeParse({ ...base, mode: "duration", duration: "1000y" }).success,
    ).toBe(false);
  });

  it("requires a duration when the mode is duration", () => {
    expect(createLicenseSchema.safeParse({ ...base, mode: "duration" }).success).toBe(false);
  });

  it("requires a date when the mode is date", () => {
    expect(createLicenseSchema.safeParse({ ...base, mode: "date" }).success).toBe(false);
  });

  it("coerces an ISO date string", () => {
    const parsed = createLicenseSchema.parse({
      ...base,
      mode: "date",
      expiresAt: "2027-01-01T00:00:00.000Z",
    });
    expect(parsed.mode).toBe("date");
    if (parsed.mode === "date") {
      expect(parsed.expiresAt).toBeInstanceOf(Date);
    }
  });

  it("defaults hwidLocked to true when omitted", () => {
    // HWID locking is on by default; an omitted checkbox must not silently
    // produce an unlocked license.
    const parsed = createLicenseSchema.parse({ productId: "prod_ABC123", mode: "permanent" });
    expect(parsed.hwidLocked).toBe(true);
  });
});
