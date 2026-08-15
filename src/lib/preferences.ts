import { z } from "zod";
import { DURATION_OPTIONS, type DurationValue } from "@/lib/licenses/expiration";
import { BATCH_QUANTITY_MAX, BATCH_QUANTITY_MIN } from "@/lib/licenses/types";

/**
 * The developer's last license-creation settings, per product.
 *
 * A developer who issues 30-day locked licenses issues another one the same
 * way, and re-choosing the same three things every time is the sort of
 * friction that makes a tool feel unfinished.
 *
 * What is stored here is exhaustive and deliberate: an expiration mode, a
 * duration preset, a device-lock choice and a quantity. Nothing else may go
 * in. Labels and notes are commercial context about a named customer, and a
 * plaintext license key must never touch storage at all — the writer projects
 * these four fields explicitly rather than spreading whatever it was handed,
 * so an extra property cannot ride along by accident.
 */

export const EXPIRATION_MODES = ["permanent", "duration", "date"] as const;
export type ExpirationMode = (typeof EXPIRATION_MODES)[number];

export type LicensePreferences = {
  mode: ExpirationMode;
  duration: DurationValue;
  hwidLocked: boolean;
  quantity: number;
};

export const DEFAULT_LICENSE_PREFERENCES: LicensePreferences = {
  mode: "permanent",
  duration: "30d",
  hwidLocked: true,
  quantity: BATCH_QUANTITY_MIN,
};

const durationValues = DURATION_OPTIONS.map((option) => option.value) as [
  DurationValue,
  ...DurationValue[],
];

/**
 * Storage is untrusted input.
 *
 * It survives across releases, it is editable by hand, and anything sharing
 * the origin can write to it. A stale key from an older build or a tampered
 * quantity must degrade to a default, never reach a form as-is — otherwise a
 * hand-edited value becomes a way to submit a batch of ten thousand.
 */
const storedSchema = z.object({
  mode: z.enum(EXPIRATION_MODES).catch(DEFAULT_LICENSE_PREFERENCES.mode),
  duration: z.enum(durationValues).catch(DEFAULT_LICENSE_PREFERENCES.duration),
  hwidLocked: z.boolean().catch(DEFAULT_LICENSE_PREFERENCES.hwidLocked),
  // Clamped rather than rejected: a tampered 10,000 becomes 100, which is
  // both the safe reading and the one that keeps the form usable.
  quantity: z.coerce
    .number()
    .transform((value) =>
      Math.min(
        Math.max(Math.trunc(value), BATCH_QUANTITY_MIN),
        BATCH_QUANTITY_MAX,
      ),
    )
    .catch(DEFAULT_LICENSE_PREFERENCES.quantity),
});

function storageKey(productId: string): string {
  return `keyren:license-prefs:${productId}`;
}

export function readLicensePreferences(productId: string): LicensePreferences {
  try {
    // Private browsing and some enterprise policies make even touching
    // localStorage throw. Falling back to defaults is the whole handling — a
    // developer should never see an error because their browser declined to
    // remember a dropdown.
    const raw = globalThis.localStorage?.getItem(storageKey(productId));
    if (!raw) return DEFAULT_LICENSE_PREFERENCES;

    const parsed = storedSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : DEFAULT_LICENSE_PREFERENCES;
  } catch {
    return DEFAULT_LICENSE_PREFERENCES;
  }
}

export function writeLicensePreferences(
  productId: string,
  preferences: LicensePreferences,
): void {
  try {
    globalThis.localStorage?.setItem(
      storageKey(productId),
      // Explicit projection, not a spread: this is the boundary that keeps
      // labels, notes and keys out of storage.
      JSON.stringify({
        mode: preferences.mode,
        duration: preferences.duration,
        hwidLocked: preferences.hwidLocked,
        quantity: Math.min(
          Math.max(Math.trunc(preferences.quantity), BATCH_QUANTITY_MIN),
          BATCH_QUANTITY_MAX,
        ),
      }),
    );
  } catch {
    // A full or unavailable store is not worth telling anyone about.
  }
}

/**
 * A one-off UI signal, such as "this developer copied an integration snippet"
 * or "this card was dismissed".
 *
 * Deliberately boolean-only: it exists so onboarding can remember a step the
 * database has no way to observe, and giving it a value would invite storing
 * something that matters.
 */
export function readUiFlag(key: string): boolean {
  try {
    return globalThis.localStorage?.getItem(`keyren:flag:${key}`) === "1";
  } catch {
    return false;
  }
}

export function writeUiFlag(key: string, value: boolean): void {
  try {
    if (value) globalThis.localStorage?.setItem(`keyren:flag:${key}`, "1");
    else globalThis.localStorage?.removeItem(`keyren:flag:${key}`);
  } catch {
    // Same reasoning as above.
  }
}
