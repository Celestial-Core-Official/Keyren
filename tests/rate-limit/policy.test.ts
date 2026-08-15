import { describe, expect, it } from "vitest";
import { clientIpFrom, verifyDimensions } from "@/lib/rate-limit";

describe("clientIpFrom", () => {
  it("takes the first entry of x-forwarded-for", async () => {
    // Vercel appends proxy hops; the leftmost entry is the original client.
    const headers = new Headers({ "x-forwarded-for": "203.0.113.5, 70.41.3.18" });
    expect(clientIpFrom(headers)).toBe("203.0.113.5");
  });

  it("trims whitespace", () => {
    expect(clientIpFrom(new Headers({ "x-forwarded-for": "  203.0.113.5  " }))).toBe("203.0.113.5");
  });

  it("falls back to x-real-ip", () => {
    expect(clientIpFrom(new Headers({ "x-real-ip": "203.0.113.9" }))).toBe("203.0.113.9");
  });

  it("returns a stable placeholder when no address is present", () => {
    // Everything unattributable shares one bucket rather than bypassing the
    // limiter entirely.
    expect(clientIpFrom(new Headers())).toBe("unknown");
  });
});

describe("verifyDimensions", () => {
  it("limits on both IP and product", () => {
    const dims = verifyDimensions({ ip: "203.0.113.5", productId: "prod_abc" });
    expect(dims.map((d) => d.name).sort()).toEqual(["ip", "product"]);
  });

  it("gives the product axis a higher ceiling than a single IP", () => {
    // One product legitimately serves many customers; one IP does not.
    const dims = verifyDimensions({ ip: "203.0.113.5", productId: "prod_abc" });
    const ip = dims.find((d) => d.name === "ip");
    const product = dims.find((d) => d.name === "product");
    expect(product!.limit).toBeGreaterThan(ip!.limit);
  });

  it("uses one-minute windows", () => {
    for (const dimension of verifyDimensions({ ip: "1.1.1.1", productId: "prod_abc" })) {
      expect(dimension.windowSeconds).toBe(60);
    }
  });

  it("honours configured overrides", () => {
    const dims = verifyDimensions(
      { ip: "1.1.1.1", productId: "prod_abc" },
      { perIpPerMinute: 5, perProductPerMinute: 50 },
    );
    expect(dims.find((d) => d.name === "ip")?.limit).toBe(5);
    expect(dims.find((d) => d.name === "product")?.limit).toBe(50);
  });
});
