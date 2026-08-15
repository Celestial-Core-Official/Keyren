import { describe, expect, it } from "vitest";
import { hashDeviceId } from "@/lib/crypto/device";

const SECRET = "test-secret-that-is-long-enough-for-the-schema";

describe("hashDeviceId", () => {
  it("returns a 64-character hex digest", () => {
    expect(hashDeviceId("device-abc", SECRET)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic", () => {
    expect(hashDeviceId("device-abc", SECRET)).toBe(hashDeviceId("device-abc", SECRET));
  });

  it("distinguishes different devices", () => {
    expect(hashDeviceId("device-a", SECRET)).not.toBe(hashDeviceId("device-b", SECRET));
  });

  it("trims incidental whitespace but preserves case", () => {
    // Fingerprints are opaque client-supplied tokens; case can be meaningful,
    // so unlike license keys they are not uppercased.
    expect(hashDeviceId("  Device-A  ", SECRET)).toBe(hashDeviceId("Device-A", SECRET));
    expect(hashDeviceId("device-a", SECRET)).not.toBe(hashDeviceId("DEVICE-A", SECRET));
  });

  it("depends on the secret", () => {
    expect(hashDeviceId("device-abc", SECRET)).not.toBe(hashDeviceId("device-abc", "other"));
  });
});
