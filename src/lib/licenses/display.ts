import { maskedLicenseKey } from "@/lib/crypto/license-key";

/** Shown where a license has no label of its own. */
export const UNLABELED_LICENSE = "Unlabeled license";

type Identifiable = { label: string | null; keyLast4: string };

/**
 * How a license is named in a table row or a card.
 *
 * An unlabeled license reads as "Unlabeled license" rather than a blank cell,
 * so the row still has a primary line and the masked key underneath stays the
 * secondary detail it is everywhere else.
 */
export function licenseTitle(license: Identifiable): string {
  return license.label ?? UNLABELED_LICENSE;
}

/**
 * How a license is named inside a sentence — a toast, a confirmation dialog.
 *
 * Here the masked key is the better fallback: "Revoked KEYREN-••••-••••-••••-
 * WXYZ" identifies which license actually changed, whereas "Revoked Unlabeled
 * license" identifies nothing when several are unlabeled.
 */
export function licenseDisplayName(license: Identifiable): string {
  return license.label ?? maskedLicenseKey(license.keyLast4);
}
