import { describe, expect, it } from "vitest";
import {
  LICENSE_KEY_PATTERN,
  generateLicenseKey,
  hashLicenseKey,
  keyHashesEqual,
  licenseKeyLast4,
  maskedLicenseKey,
  normalizeLicenseKey,
} from "@/lib/crypto/license-key";

const SECRET = "test-secret-that-is-long-enough-for-the-schema";

describe("generateLicenseKey", () => {
  it("matches the KEYREN-XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX format", () => {
    expect(generateLicenseKey()).toMatch(LICENSE_KEY_PATTERN);
  });

  it("carries 160 bits of entropy across four 8-character groups", () => {
    const groups = generateLicenseKey().split("-").slice(1);
    expect(groups).toHaveLength(4);
    for (const group of groups) expect(group).toHaveLength(8);
    expect(groups.join("").length * 5).toBe(160);
  });

  it("never repeats", () => {
    const keys = Array.from({ length: 2000 }, generateLicenseKey);
    expect(new Set(keys).size).toBe(2000);
  });
});

describe("normalizeLicenseKey", () => {
  it("uppercases and strips surrounding whitespace", () => {
    const key = generateLicenseKey();
    expect(normalizeLicenseKey(`  ${key.toLowerCase()}  `)).toBe(key);
  });

  it("strips internal whitespace introduced by copy and paste", () => {
    const key = generateLicenseKey();
    const mangled = key.replace(/-/g, " - ");
    expect(normalizeLicenseKey(mangled)).toBe(key);
  });

  it("maps Crockford-ambiguous glyphs onto their canonical digits", () => {
    // A user reading a key off a screen may type O for 0 or I/L for 1.
    // Those glyphs are not in the alphabet, so folding them is unambiguous.
    expect(normalizeLicenseKey("KEYREN-OOOOOOOO-IIIIIIII-LLLLLLLL-00000000")).toBe(
      "KEYREN-00000000-11111111-11111111-00000000",
    );
  });

  it("leaves an already-canonical key untouched", () => {
    const key = generateLicenseKey();
    expect(normalizeLicenseKey(normalizeLicenseKey(key))).toBe(key);
  });
});

describe("hashLicenseKey", () => {
  it("returns a 64-character hex digest", () => {
    expect(hashLicenseKey(generateLicenseKey(), SECRET)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic for the same key and secret", () => {
    const key = generateLicenseKey();
    expect(hashLicenseKey(key, SECRET)).toBe(hashLicenseKey(key, SECRET));
  });

  it("normalizes before hashing, so casing does not change the hash", () => {
    const key = generateLicenseKey();
    expect(hashLicenseKey(key.toLowerCase(), SECRET)).toBe(
      hashLicenseKey(key, SECRET),
    );
  });

  it("produces different digests under different secrets", () => {
    const key = generateLicenseKey();
    expect(hashLicenseKey(key, SECRET)).not.toBe(hashLicenseKey(key, "other-secret"));
  });

  it("produces different digests for different keys", () => {
    expect(hashLicenseKey(generateLicenseKey(), SECRET)).not.toBe(
      hashLicenseKey(generateLicenseKey(), SECRET),
    );
  });

  it("is domain-separated from device hashing", async () => {
    // A value must never be simultaneously valid as a license and a device.
    const { hashDeviceId } = await import("@/lib/crypto/device");
    const shared = "SOME-SHARED-VALUE";
    expect(hashLicenseKey(shared, SECRET)).not.toBe(hashDeviceId(shared, SECRET));
  });
});

describe("keyHashesEqual", () => {
  it("accepts identical digests", () => {
    const hash = hashLicenseKey(generateLicenseKey(), SECRET);
    expect(keyHashesEqual(hash, hash)).toBe(true);
  });

  it("rejects different digests", () => {
    expect(
      keyHashesEqual(
        hashLicenseKey(generateLicenseKey(), SECRET),
        hashLicenseKey(generateLicenseKey(), SECRET),
      ),
    ).toBe(false);
  });

  it("rejects mismatched lengths without throwing", () => {
    // timingSafeEqual throws on length mismatch; the wrapper must not.
    expect(keyHashesEqual("abc", "abcdef")).toBe(false);
  });
});

describe("licenseKeyLast4 and maskedLicenseKey", () => {
  it("captures the final four characters", () => {
    expect(licenseKeyLast4("KEYREN-ABCDEFGH-ABCDEFGH-ABCDEFGH-ABCDWXYZ")).toBe("WXYZ");
  });

  it("renders a masked reference that reveals only the suffix", () => {
    const masked = maskedLicenseKey("WXYZ");
    expect(masked).toContain("WXYZ");
    expect(masked).toContain("KEYREN");
    expect(masked).not.toMatch(/[A-HJ-NP-TV-Z0-9]{8}/);
  });

  it("puts the suffix in its own group rather than trailing a masked one", () => {
    // The last group reads as four visible characters, not eight bullets with
    // four characters stuck on the end. Alpha_v1's form implied the suffix was
    // extra characters beyond a full-width group.
    expect(maskedLicenseKey("WXYZ")).toBe("KEYREN-••••-••••-••••-WXYZ");
  });
});
