import { createHmac, timingSafeEqual } from "node:crypto";
import { randomAlphabetString } from "./random";

const PREFIX = "KEYREN";
const GROUP_COUNT = 4;
const GROUP_LENGTH = 8;

/** 4 groups x 8 symbols x 5 bits per Crockford symbol = 160 bits. */
export const LICENSE_KEY_ENTROPY_BITS = GROUP_COUNT * GROUP_LENGTH * 5;

export const LICENSE_KEY_PATTERN =
  /^KEYREN-[0-9A-HJKMNP-TV-Z]{8}-[0-9A-HJKMNP-TV-Z]{8}-[0-9A-HJKMNP-TV-Z]{8}-[0-9A-HJKMNP-TV-Z]{8}$/;

/**
 * Generates a license key with 160 bits of entropy from the OS CSPRNG.
 *
 * Explicitly NOT derived from Math.random, a timestamp, a counter, or a
 * truncated UUID — a truncated UUIDv4 would give only 122 bits before
 * truncation and fewer after.
 */
export function generateLicenseKey(): string {
  const groups = Array.from({ length: GROUP_COUNT }, () =>
    randomAlphabetString(GROUP_LENGTH),
  );
  return [PREFIX, ...groups].join("-");
}

/**
 * Canonicalises a key the way a human might mistype it.
 *
 * Crockford Base32 excludes I, L, O and U from the alphabet, which means
 * folding I and L to 1 and O to 0 can never collide with a real symbol.
 * Whitespace anywhere is dropped so pasted keys with stray spaces or
 * newlines still verify.
 */
export function normalizeLicenseKey(input: string): string {
  return input
    .replace(/\s+/g, "")
    .toUpperCase()
    .replace(/[IL]/g, "1")
    .replace(/O/g, "0");
}

/**
 * Derives the value stored in `licenses.key_hash`.
 *
 * A keyed construction (HMAC) rather than a bare SHA-256: the key space is
 * large enough that brute force is infeasible either way, but a bare digest
 * would let anyone holding a database dump verify guesses offline. Without
 * the server secret, an HMAC dump is inert.
 *
 * The "license:" prefix domain-separates this from device fingerprint
 * hashing, which uses the same secret.
 */
export function hashLicenseKey(licenseKey: string, secret: string): string {
  const normalized = normalizeLicenseKey(licenseKey);
  return createHmac("sha256", secret).update(`license:${normalized}`).digest("hex");
}

/**
 * Constant-time digest comparison. The primary lookup is an indexed equality
 * match in Postgres; this is a defense-in-depth re-check on the row that came
 * back, so a future refactor that loosens the query cannot turn into a
 * timing-observable comparison.
 */
export function keyHashesEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/**
 * The last four characters, captured at creation time so the dashboard has a
 * stable non-secret reference for a key it can never show again. Four symbols
 * of a 160-bit key leak 20 bits, which does not meaningfully assist guessing.
 */
export function licenseKeyLast4(licenseKey: string): string {
  return normalizeLicenseKey(licenseKey).slice(-4);
}

/**
 * The dashboard's stable, non-secret reference to a key it can never redisplay.
 *
 * The suffix occupies the final group rather than trailing a masked one, so
 * the string reads as four groups like a real key instead of implying there
 * are four characters beyond a full-width group.
 */
export function maskedLicenseKey(last4: string): string {
  return `${PREFIX}-••••-••••-••••-${last4}`;
}
