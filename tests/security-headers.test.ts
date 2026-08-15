import { describe, expect, it } from "vitest";
import nextConfig from "../next.config";

describe("security headers", () => {
  it("disables the framework signature", () => {
    expect(nextConfig.poweredByHeader).toBe(false);
  });

  it("sets baseline browser protections on every route", async () => {
    const rules = await nextConfig.headers?.();
    const catchAll = rules?.find((rule) => rule.source === "/(.*)");
    const headers = Object.fromEntries(
      catchAll?.headers.map(({ key, value }) => [key.toLowerCase(), value]) ?? [],
    );

    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["permissions-policy"]).toContain("camera=()");
  });
});
