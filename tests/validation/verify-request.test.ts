import { describe, expect, it } from "vitest";
import { verifyRequestSchema } from "@/lib/validation/verify-request";

const valid = {
  productId: "prod_ABCDEFGHJKMNPQRSTVWXYZ012",
  licenseKey: "KEYREN-ABCDEFGH-ABCDEFGH-ABCDEFGH-ABCDEFGH",
  deviceId: "device-fingerprint",
};

describe("verifyRequestSchema", () => {
  it("accepts a well-formed body", () => {
    expect(verifyRequestSchema.safeParse(valid).success).toBe(true);
  });

  it.each(["productId", "licenseKey", "deviceId"] as const)(
    "rejects a body missing %s",
    (field) => {
      const body: Record<string, unknown> = { ...valid };
      delete body[field];
      expect(verifyRequestSchema.safeParse(body).success).toBe(false);
    },
  );

  it.each(["productId", "licenseKey", "deviceId"] as const)(
    "rejects a non-string %s",
    (field) => {
      expect(verifyRequestSchema.safeParse({ ...valid, [field]: 12345 }).success).toBe(false);
    },
  );

  it("rejects a product id without the prod_ prefix", () => {
    expect(verifyRequestSchema.safeParse({ ...valid, productId: "abc123" }).success).toBe(false);
  });

  it("rejects an empty device id", () => {
    expect(verifyRequestSchema.safeParse({ ...valid, deviceId: "" }).success).toBe(false);
  });

  it("rejects an oversized device id", () => {
    // Bounded so a client cannot push megabytes through the HMAC.
    expect(
      verifyRequestSchema.safeParse({ ...valid, deviceId: "x".repeat(1025) }).success,
    ).toBe(false);
  });

  it("rejects an oversized license key", () => {
    expect(
      verifyRequestSchema.safeParse({ ...valid, licenseKey: "x".repeat(500) }).success,
    ).toBe(false);
  });

  it("strips unknown fields rather than trusting them", () => {
    const parsed = verifyRequestSchema.parse({ ...valid, isAdmin: true, ownerId: "user_x" });
    expect(parsed).not.toHaveProperty("isAdmin");
    expect(parsed).not.toHaveProperty("ownerId");
  });

  it("accepts a lowercase license key for normalization downstream", () => {
    expect(
      verifyRequestSchema.safeParse({ ...valid, licenseKey: valid.licenseKey.toLowerCase() })
        .success,
    ).toBe(true);
  });

  it("rejects null and array bodies", () => {
    expect(verifyRequestSchema.safeParse(null).success).toBe(false);
    expect(verifyRequestSchema.safeParse([]).success).toBe(false);
  });
});
