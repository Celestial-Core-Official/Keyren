import { createHmac } from "node:crypto";

/**
 * Hashes a client-supplied device fingerprint for storage.
 *
 * Two things this deliberately does NOT claim:
 *
 * 1. That the fingerprint is unspoofable. It arrives from an untrusted client
 *    and can be forged by anyone willing to reverse engineer the integration.
 *    It is an identifier that raises the cost of casual key sharing — not a
 *    hardware security primitive.
 * 2. That hashing here protects a low-entropy input from brute force. It does
 *    not; an attacker who can guess the fingerprint can compute nothing
 *    without the secret, but the point of hashing is that Keyren never needs
 *    to hold the raw value at rest.
 *
 * Domain-separated from license key hashing via the "device:" prefix.
 */
export function hashDeviceId(deviceId: string, secret: string): string {
  return createHmac("sha256", secret).update(`device:${deviceId.trim()}`).digest("hex");
}
