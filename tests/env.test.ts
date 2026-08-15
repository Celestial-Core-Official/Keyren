import { describe, expect, it } from "vitest";
import { parseEnv } from "@/env";

const valid = {
  DATABASE_URL: "postgres://user:pass@localhost:5432/keyren",
  KEYREN_LICENSE_HMAC_SECRET: "a".repeat(64),
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_x",
  CLERK_SECRET_KEY: "sk_test_x",
};

describe("parseEnv", () => {
  it("accepts a complete valid environment", () => {
    const env = parseEnv(valid);
    expect(env.DATABASE_URL).toBe(valid.DATABASE_URL);
    expect(env.RATE_LIMIT_VERIFY_PER_MINUTE).toBe(60);
  });

  it("rejects a missing database url", () => {
    expect(() => parseEnv({ ...valid, DATABASE_URL: undefined })).toThrow(
      /DATABASE_URL/,
    );
  });

  it("rejects an HMAC secret that is too short to be safe", () => {
    expect(() =>
      parseEnv({ ...valid, KEYREN_LICENSE_HMAC_SECRET: "short" }),
    ).toThrow(/KEYREN_LICENSE_HMAC_SECRET/);
  });

  it("never includes the secret in the thrown message", () => {
    try {
      parseEnv({ ...valid, KEYREN_LICENSE_HMAC_SECRET: "leakme" });
      throw new Error("should have thrown");
    } catch (error) {
      expect((error as Error).message).not.toContain("leakme");
    }
  });

  it("coerces numeric rate limit overrides", () => {
    const env = parseEnv({ ...valid, RATE_LIMIT_VERIFY_PER_MINUTE: "10" });
    expect(env.RATE_LIMIT_VERIFY_PER_MINUTE).toBe(10);
  });
});
