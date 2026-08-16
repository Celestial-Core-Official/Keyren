import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDatabase, truncateAll } from "../helpers/db";
import { DEVELOPER_A, makeLicense, makeApplication } from "../helpers/factories";
import type { Database } from "@/db/types";

let db: Database;
let close: () => Promise<void>;

vi.mock("@/db", () => ({
  get db() {
    return db;
  },
}));

vi.mock("@/env", () => ({
  env: {
    KEYREN_LICENSE_HMAC_SECRET: "test-hmac-secret-value-at-least-32-chars-long",
    RATE_LIMIT_VERIFY_PER_MINUTE: 5,
    RATE_LIMIT_VERIFY_PER_APPLICATION_PER_MINUTE: 100,
  },
}));

beforeAll(async () => {
  ({ db, close } = await createTestDatabase());
});
afterAll(async () => {
  await close();
});
beforeEach(async () => {
  await truncateAll(db);
});

function request(body: unknown, ip = "203.0.113.5"): Request {
  return new Request("https://keyren.dev/api/v1/licenses/verify", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("POST /api/v1/licenses/verify", () => {
  it("returns 200 and the documented success envelope", async () => {
    const { POST } = await import("@/app/api/v1/licenses/verify/route");
    const application = await makeApplication(db, { ownerId: DEVELOPER_A });
    const license = await makeLicense(db, { applicationId: application.id });

    const response = await POST(
      request({
        applicationId: application.id,
        licenseKey: license.plaintextKey,
        deviceId: "device-one",
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      license: { status: "active", expiresAt: null },
    });
  });

  it("returns 403 LICENSE_INVALID for an unissued key", async () => {
    const { POST } = await import("@/app/api/v1/licenses/verify/route");
    const application = await makeApplication(db, { ownerId: DEVELOPER_A });

    const response = await POST(
      request({
        applicationId: application.id,
        licenseKey: "KEYREN-ABCDEFGH-ABCDEFGH-ABCDEFGH-ABCDEFGH",
        deviceId: "device-one",
      }),
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("LICENSE_INVALID");
  });

  it("returns 404 APPLICATION_INVALID for an unknown application", async () => {
    const { POST } = await import("@/app/api/v1/licenses/verify/route");
    const response = await POST(
      request({
        applicationId: "app_UNKNOWN0000000000000000",
        licenseKey: "KEYREN-ABCDEFGH-ABCDEFGH-ABCDEFGH-ABCDEFGH",
        deviceId: "device-one",
      }),
    );

    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe("APPLICATION_INVALID");
  });

  it("returns 403 DEVICE_MISMATCH for a second device", async () => {
    const { POST } = await import("@/app/api/v1/licenses/verify/route");
    const application = await makeApplication(db, { ownerId: DEVELOPER_A });
    const license = await makeLicense(db, { applicationId: application.id, hwidLocked: true });

    const body = { applicationId: application.id, licenseKey: license.plaintextKey };
    await POST(request({ ...body, deviceId: "device-one" }));
    const response = await POST(request({ ...body, deviceId: "device-two" }));

    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe("DEVICE_MISMATCH");
  });

  // Spec test #16
  describe("malformed request", () => {
    it("returns 400 for a body that is not JSON", async () => {
      const { POST } = await import("@/app/api/v1/licenses/verify/route");
      const response = await POST(request("this is not json"));
      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe("BAD_REQUEST");
    });

    it("returns 400 for a body missing required fields", async () => {
      const { POST } = await import("@/app/api/v1/licenses/verify/route");
      const response = await POST(request({ applicationId: "app_ABC" }));
      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe("BAD_REQUEST");
    });

    it("does not leak validation internals in the message", async () => {
      const { POST } = await import("@/app/api/v1/licenses/verify/route");
      const response = await POST(request({}));
      const body = await response.json();
      expect(body.error.message).toBe("The request body was malformed.");
      expect(JSON.stringify(body)).not.toMatch(/zod|expected|received|path/i);
    });

    it("rejects a non-POST method", async () => {
      const routeModule = await import("@/app/api/v1/licenses/verify/route");
      // GET is exported explicitly so the framework returns a clean 405
      // rather than an unhandled 404 for a wrong-method integration bug.
      const response = await routeModule.GET();
      expect(response.status).toBe(405);
    });
  });

  // Spec test #17
  describe("rate limiting", () => {
    it("returns 429 RATE_LIMITED once the per-IP limit is exceeded", async () => {
      const { POST } = await import("@/app/api/v1/licenses/verify/route");
      const application = await makeApplication(db, { ownerId: DEVELOPER_A });
      const license = await makeLicense(db, { applicationId: application.id, hwidLocked: false });

      const body = {
        applicationId: application.id,
        licenseKey: license.plaintextKey,
        deviceId: "device-one",
      };

      // The mocked config allows 5 per minute per IP.
      for (let i = 0; i < 5; i += 1) {
        expect((await POST(request(body, "198.51.100.7"))).status).toBe(200);
      }

      const limited = await POST(request(body, "198.51.100.7"));
      expect(limited.status).toBe(429);
      expect((await limited.json()).error.code).toBe("RATE_LIMITED");
    });

    it("sets a Retry-After header", async () => {
      const { POST } = await import("@/app/api/v1/licenses/verify/route");
      const application = await makeApplication(db, { ownerId: DEVELOPER_A });
      const license = await makeLicense(db, { applicationId: application.id, hwidLocked: false });
      const body = {
        applicationId: application.id,
        licenseKey: license.plaintextKey,
        deviceId: "device-one",
      };

      for (let i = 0; i < 6; i += 1) await POST(request(body, "198.51.100.8"));
      const limited = await POST(request(body, "198.51.100.8"));

      expect(limited.status).toBe(429);
      expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);
    });

    it("does not limit a different IP", async () => {
      const { POST } = await import("@/app/api/v1/licenses/verify/route");
      const application = await makeApplication(db, { ownerId: DEVELOPER_A });
      const license = await makeLicense(db, { applicationId: application.id, hwidLocked: false });
      const body = {
        applicationId: application.id,
        licenseKey: license.plaintextKey,
        deviceId: "device-one",
      };

      for (let i = 0; i < 6; i += 1) await POST(request(body, "198.51.100.9"));
      expect((await POST(request(body, "198.51.100.10"))).status).toBe(200);
    });

    it("limits before touching the license lookup", async () => {
      // Proves the limiter runs ahead of any database work, so a flood of
      // guesses cannot be used to probe the licenses table.
      const { POST } = await import("@/app/api/v1/licenses/verify/route");
      const junk = {
        applicationId: "app_UNKNOWN0000000000000000",
        licenseKey: "KEYREN-ABCDEFGH-ABCDEFGH-ABCDEFGH-ABCDEFGH",
        deviceId: "device-one",
      };

      for (let i = 0; i < 5; i += 1) await POST(request(junk, "198.51.100.11"));
      const limited = await POST(request(junk, "198.51.100.11"));

      // 429 rather than the 404 an unlimited request would have produced.
      expect(limited.status).toBe(429);
    });
  });

  it("never echoes the submitted license key", async () => {
    const { POST } = await import("@/app/api/v1/licenses/verify/route");
    const application = await makeApplication(db, { ownerId: DEVELOPER_A });
    const license = await makeLicense(db, { applicationId: application.id, status: "revoked" });

    const response = await POST(
      request({
        applicationId: application.id,
        licenseKey: license.plaintextKey,
        deviceId: "device-one",
      }),
    );

    expect(await response.text()).not.toContain(license.plaintextKey);
  });
});
