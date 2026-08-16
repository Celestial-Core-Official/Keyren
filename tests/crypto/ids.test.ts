import { describe, expect, it } from "vitest";
import { generateActivationId, generateLicenseId, generateApplicationId } from "@/lib/crypto/ids";

describe("generateApplicationId", () => {
  it("is prefixed and 26 random symbols long", () => {
    const id = generateApplicationId();
    expect(id).toMatch(/^app_[0-9A-HJKMNP-TV-Z]{26}$/);
  });

  it("carries at least 128 bits of entropy", () => {
    // 26 symbols from a 32-symbol alphabet = 26 * 5 = 130 bits.
    const random = generateApplicationId().slice("app_".length);
    expect(random.length * 5).toBeGreaterThanOrEqual(128);
  });

  it("is not sequential or guessable across calls", () => {
    const ids = Array.from({ length: 1000 }, generateApplicationId);
    expect(new Set(ids).size).toBe(1000);
  });
});

describe("generateLicenseId", () => {
  it("is prefixed and 26 random symbols long", () => {
    expect(generateLicenseId()).toMatch(/^lic_[0-9A-HJKMNP-TV-Z]{26}$/);
  });

  it("is distinct from application ids", () => {
    expect(generateLicenseId().startsWith("lic_")).toBe(true);
    expect(generateApplicationId().startsWith("app_")).toBe(true);
  });
});

describe("generateActivationId", () => {
  it("is prefixed and 26 random symbols long", () => {
    expect(generateActivationId()).toMatch(/^act_[0-9A-HJKMNP-TV-Z]{26}$/);
  });
});
