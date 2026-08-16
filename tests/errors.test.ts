import { describe, expect, it } from "vitest";
import {
  VERIFICATION_ERROR_STATUS,
  VERIFICATION_ERROR_MESSAGE,
  type VerificationErrorCode,
} from "@/lib/errors";
import { maskLicenseKey } from "@/lib/log";

const ALL_CODES: VerificationErrorCode[] = [
  "BAD_REQUEST",
  "APPLICATION_INVALID",
  "LICENSE_INVALID",
  "LICENSE_REVOKED",
  "LICENSE_EXPIRED",
  "DEVICE_MISMATCH",
  "RATE_LIMITED",
  "INTERNAL_ERROR",
];

describe("verification error taxonomy", () => {
  it("maps every code to an HTTP status", () => {
    for (const code of ALL_CODES) {
      expect(VERIFICATION_ERROR_STATUS[code]).toBeGreaterThanOrEqual(400);
    }
  });

  it("uses conventional statuses", () => {
    expect(VERIFICATION_ERROR_STATUS.BAD_REQUEST).toBe(400);
    expect(VERIFICATION_ERROR_STATUS.APPLICATION_INVALID).toBe(404);
    expect(VERIFICATION_ERROR_STATUS.LICENSE_INVALID).toBe(403);
    expect(VERIFICATION_ERROR_STATUS.LICENSE_REVOKED).toBe(403);
    expect(VERIFICATION_ERROR_STATUS.LICENSE_EXPIRED).toBe(403);
    expect(VERIFICATION_ERROR_STATUS.DEVICE_MISMATCH).toBe(403);
    expect(VERIFICATION_ERROR_STATUS.RATE_LIMITED).toBe(429);
    expect(VERIFICATION_ERROR_STATUS.INTERNAL_ERROR).toBe(500);
  });

  it("gives every code a message free of internal detail", () => {
    for (const code of ALL_CODES) {
      const message = VERIFICATION_ERROR_MESSAGE[code];
      expect(message.length).toBeGreaterThan(0);
      expect(message).not.toMatch(/select |from |table|column|postgres|stack/i);
    }
  });
});

describe("maskLicenseKey", () => {
  it("hides everything but the final four characters", () => {
    const masked = maskLicenseKey("KEYREN-ABCDEFGH-ABCDEFGH-ABCDEFGH-ABCDWXYZ");
    expect(masked).toBe("KEYREN-****-****-****-****WXYZ");
    expect(masked).not.toContain("ABCDEFGH");
  });

  it("fully redacts a value too short to mask safely", () => {
    expect(maskLicenseKey("abc")).toBe("[redacted]");
  });

  it("fully redacts an empty value", () => {
    expect(maskLicenseKey("")).toBe("[redacted]");
  });
});
