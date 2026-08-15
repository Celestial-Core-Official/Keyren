/**
 * Masks a license key for logging. Raw keys must never reach logs, analytics,
 * error traces, or audit records — a log aggregator is a far softer target
 * than the database, and the database does not hold plaintext at all.
 */
export function maskLicenseKey(licenseKey: string): string {
  if (licenseKey.length < 8) return "[redacted]";
  return `KEYREN-****-****-****-****${licenseKey.slice(-4)}`;
}
