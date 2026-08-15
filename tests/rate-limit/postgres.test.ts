import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDatabase, truncateAll } from "../helpers/db";
import { PostgresRateLimiter } from "@/lib/rate-limit/postgres";
import type { RateLimitDimension } from "@/lib/rate-limit/types";
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

const ip = (value: string, limit = 3): RateLimitDimension => ({
  name: "ip",
  value,
  limit,
  windowSeconds: 60,
});

describe("PostgresRateLimiter", () => {
  it("allows requests up to the limit", async () => {
    const limiter = new PostgresRateLimiter(db);
    for (let i = 0; i < 3; i += 1) {
      expect((await limiter.consume([ip("1.1.1.1")])).allowed).toBe(true);
    }
  });

  it("denies the request past the limit", async () => {
    const limiter = new PostgresRateLimiter(db);
    for (let i = 0; i < 3; i += 1) await limiter.consume([ip("1.1.1.1")]);

    const result = await limiter.consume([ip("1.1.1.1")]);
    expect(result.allowed).toBe(false);
    if (result.allowed) throw new Error("expected denial");
    expect(result.retryAfterSeconds).toBeGreaterThan(0);
    expect(result.retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  it("keeps separate counters per value", async () => {
    const limiter = new PostgresRateLimiter(db);
    for (let i = 0; i < 3; i += 1) await limiter.consume([ip("1.1.1.1")]);

    expect((await limiter.consume([ip("2.2.2.2")])).allowed).toBe(true);
  });

  it("keeps separate counters per axis", async () => {
    const limiter = new PostgresRateLimiter(db);
    const product: RateLimitDimension = {
      name: "product",
      value: "1.1.1.1",
      limit: 3,
      windowSeconds: 60,
    };
    for (let i = 0; i < 3; i += 1) await limiter.consume([ip("1.1.1.1")]);

    // Same value, different axis — must not share a bucket.
    expect((await limiter.consume([product])).allowed).toBe(true);
  });

  it("denies when any one dimension is exhausted", async () => {
    const limiter = new PostgresRateLimiter(db);
    const dims = [ip("1.1.1.1", 2), { name: "product", value: "prod_x", limit: 100, windowSeconds: 60 }];

    expect((await limiter.consume(dims)).allowed).toBe(true);
    expect((await limiter.consume(dims)).allowed).toBe(true);
    expect((await limiter.consume(dims)).allowed).toBe(false);
  });

  it("starts a fresh window once the old one lapses", async () => {
    const limiter = new PostgresRateLimiter(db);
    const short = { name: "ip", value: "1.1.1.1", limit: 1, windowSeconds: 1 };

    expect((await limiter.consume([short])).allowed).toBe(true);
    expect((await limiter.consume([short])).allowed).toBe(false);

    await new Promise((resolve) => setTimeout(resolve, 1100));
    expect((await limiter.consume([short])).allowed).toBe(true);
  });

  it("fails open when the store errors", async () => {
    // A licensing check must not become unavailable because the limiter's
    // table is unreachable. Failing closed here would take every customer's
    // software offline over a rate-limit outage, which is a worse outcome
    // than briefly unmetered traffic.
    const broken = {
      execute: () => Promise.reject(new Error("store down")),
    } as unknown as Database;

    const limiter = new PostgresRateLimiter(broken);
    expect((await limiter.consume([ip("1.1.1.1")])).allowed).toBe(true);
  });

  it("allows an empty dimension list", async () => {
    const limiter = new PostgresRateLimiter(db);
    expect((await limiter.consume([])).allowed).toBe(true);
  });
});
