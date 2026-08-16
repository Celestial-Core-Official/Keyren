import { describe, expect, it } from "vitest";
import {
  createLicenseSchema,
  createApplicationSchema,
  licenseIdSchema,
  applicationIdSchema,
  renameApplicationSchema,
} from "@/lib/validation/dashboard";

describe("createApplicationSchema", () => {
  it("accepts a reasonable name", () => {
    expect(createApplicationSchema.safeParse({ name: "Seliware Key" }).success).toBe(true);
  });

  it("trims surrounding whitespace", () => {
    expect(createApplicationSchema.parse({ name: "  Spaced  " }).name).toBe("Spaced");
  });

  it("rejects an empty or whitespace-only name", () => {
    expect(createApplicationSchema.safeParse({ name: "" }).success).toBe(false);
    expect(createApplicationSchema.safeParse({ name: "   " }).success).toBe(false);
  });

  it("rejects an oversized name", () => {
    expect(createApplicationSchema.safeParse({ name: "x".repeat(201) }).success).toBe(false);
  });

  it("ignores an ownerId supplied by the client", () => {
    // Ownership comes from Clerk, never from the browser. Even if a crafted
    // request carries one, it must not survive parsing.
    const parsed = createApplicationSchema.parse({ name: "Ok", ownerId: "user_attacker" });
    expect(parsed).not.toHaveProperty("ownerId");
  });
});

describe("renameApplicationSchema", () => {
  it("requires both an application id and a name", () => {
    expect(
      renameApplicationSchema.safeParse({ applicationId: "app_ABC", name: "New" }).success,
    ).toBe(true);
    expect(renameApplicationSchema.safeParse({ name: "New" }).success).toBe(false);
  });
});

describe("id schemas", () => {
  it("requires the app_ prefix", () => {
    expect(applicationIdSchema.safeParse("app_ABC123").success).toBe(true);
    expect(applicationIdSchema.safeParse("lic_ABC123").success).toBe(false);
  });

  it("requires the lic_ prefix", () => {
    expect(licenseIdSchema.safeParse("lic_ABC123").success).toBe(true);
    expect(licenseIdSchema.safeParse("app_ABC123").success).toBe(false);
  });
});

describe("createLicenseSchema", () => {
  const base = { applicationId: "app_ABC123", hwidLocked: true };

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
    const parsed = createLicenseSchema.parse({ applicationId: "app_ABC123", mode: "permanent" });
    expect(parsed.hwidLocked).toBe(true);
  });
});
