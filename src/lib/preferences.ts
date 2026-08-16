import { z } from "zod";
import { DURATION_OPTIONS, type DurationValue } from "@/lib/licenses/expiration";
import {
  BATCH_QUANTITY_MAX,
  BATCH_QUANTITY_MIN,
  PAGE_SIZES,
  type PageSize,
} from "@/lib/licenses/types";

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
    emit();
  } catch {
    // A full or unavailable store is not worth telling anyone about.
  }
}

/**
 * The same four fields, but as the developer's account-wide default rather
 * than one product's memory.
 *
 * These seed a product that has never been used. A product that already has
 * its own stored preferences keeps them — changing a default must not silently
 * rewrite what an established product learned, because the whole point of the
 * per-product memory is that a product which issues 30-day locked licenses
 * keeps issuing them.
 */
const GLOBAL_DEFAULTS_KEY = "keyren:defaults";

export function readGlobalDefaults(): LicensePreferences {
  try {
    const raw = globalThis.localStorage?.getItem(GLOBAL_DEFAULTS_KEY);
    if (!raw) return DEFAULT_LICENSE_PREFERENCES;

    const parsed = storedSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : DEFAULT_LICENSE_PREFERENCES;
  } catch {
    return DEFAULT_LICENSE_PREFERENCES;
  }
}

export function writeGlobalDefaults(preferences: LicensePreferences): void {
  try {
    globalThis.localStorage?.setItem(
      GLOBAL_DEFAULTS_KEY,
      // Same explicit projection as the per-product writer, for the same
      // reason: this is the boundary that keeps labels, notes and keys out.
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
    emit();
  } catch {
    // As above.
  }
}

/**
 * What a creation form should open with.
 *
 * Resolution order is per-product, then account default, then built-in. The
 * absence of a stored product entry is the signal — not a comparison against
 * the defaults, which would make a product that deliberately matches the
 * default indistinguishable from one that has never been touched.
 */
export function resolveLicensePreferences(productId: string): LicensePreferences {
  try {
    const stored = globalThis.localStorage?.getItem(storageKey(productId));
    if (stored) return readLicensePreferences(productId);
  } catch {
    // Fall through to the account default.
  }

  return readGlobalDefaults();
}

/**
 * Display preferences: how much of a list to show, and whether to print local
 * time next to UTC.
 *
 * UTC remains the primary reading everywhere. `showLocalTime` only ever adds a
 * secondary line — an expiry of Dec 31 must not become Jan 1 for a developer
 * in Sydney, because the verification API's answer will not have moved.
 */
export type DisplayPreferences = {
  pageSize: PageSize;
  showLocalTime: boolean;
};

export const DEFAULT_DISPLAY_PREFERENCES: DisplayPreferences = {
  pageSize: 25,
  showLocalTime: false,
};

function isPageSize(value: unknown): value is PageSize {
  return (PAGE_SIZES as readonly unknown[]).includes(value);
}

// Derived from PAGE_SIZES rather than restating 25/50/100, so adding a page
// size in one place cannot leave this validator silently rejecting it.
const displaySchema = z.object({
  pageSize: z.coerce
    .number()
    .transform((value) => (isPageSize(value) ? value : DEFAULT_DISPLAY_PREFERENCES.pageSize))
    .catch(DEFAULT_DISPLAY_PREFERENCES.pageSize),
  showLocalTime: z.boolean().catch(DEFAULT_DISPLAY_PREFERENCES.showLocalTime),
});

const DISPLAY_KEY = "keyren:display";

export function readDisplayPreferences(): DisplayPreferences {
  try {
    const raw = globalThis.localStorage?.getItem(DISPLAY_KEY);
    if (!raw) return DEFAULT_DISPLAY_PREFERENCES;

    const parsed = displaySchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : DEFAULT_DISPLAY_PREFERENCES;
  } catch {
    return DEFAULT_DISPLAY_PREFERENCES;
  }
}

export function writeDisplayPreferences(preferences: DisplayPreferences): void {
  try {
    globalThis.localStorage?.setItem(
      DISPLAY_KEY,
      JSON.stringify({
        pageSize: isPageSize(preferences.pageSize)
          ? preferences.pageSize
          : DEFAULT_DISPLAY_PREFERENCES.pageSize,
        showLocalTime: preferences.showLocalTime,
      }),
    );
    emit();
  } catch {
    // As above.
  }
}

/**
 * Forgets every remembered preference and dismissed card.
 *
 * Until now these were written and never surfaced: a dismissed onboarding
 * checklist could not be brought back, and a product's remembered quantity
 * could not be forgotten. Scoped to the `keyren:` prefix so it cannot clear
 * anything else sharing the origin — including Clerk's session.
 */
export function clearStoredPreferences(): void {
  try {
    const storage = globalThis.localStorage;
    if (!storage) return;

    const doomed: string[] = [];
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key?.startsWith("keyren:")) doomed.push(key);
    }

    for (const key of doomed) storage.removeItem(key);
    emit();
  } catch {
    // As above.
  }
}

/**
 * Storage as a subscribable store, so React can read it correctly.
 *
 * `localStorage` is external mutable state, and the honest way to read it from
 * a component is `useSyncExternalStore` — it renders the server snapshot
 * during hydration and swaps to the real value immediately after, without the
 * load-in-an-effect dance that both trips the lint rule and paints one frame
 * of the wrong settings.
 *
 * The browser's own `storage` event only fires in OTHER tabs, so writes made
 * here have to announce themselves. Every writer below calls `emit`.
 *
 * Snapshots are cached because `useSyncExternalStore` compares them by
 * identity: parsing storage afresh on each call returns a new object every
 * time, which reads as a perpetual change and loops forever.
 */
type Listener = () => void;
const listeners = new Set<Listener>();

let defaultsSnapshot: LicensePreferences | null = null;
let displaySnapshot: DisplayPreferences | null = null;

function emit(): void {
  defaultsSnapshot = null;
  displaySnapshot = null;
  for (const listener of listeners) listener();
}

export function subscribePreferences(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getGlobalDefaultsSnapshot(): LicensePreferences {
  defaultsSnapshot ??= readGlobalDefaults();
  return defaultsSnapshot;
}

export function getDisplaySnapshot(): DisplayPreferences {
  displaySnapshot ??= readDisplayPreferences();
  return displaySnapshot;
}

/**
 * The server has no storage to read, so it renders the built-in defaults.
 * These must be referentially stable, which is why they are the exported
 * constants rather than fresh literals.
 */
export function getGlobalDefaultsServerSnapshot(): LicensePreferences {
  return DEFAULT_LICENSE_PREFERENCES;
}

export function getDisplayServerSnapshot(): DisplayPreferences {
  return DEFAULT_DISPLAY_PREFERENCES;
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
    emit();
  } catch {
    // Same reasoning as above.
  }
}
