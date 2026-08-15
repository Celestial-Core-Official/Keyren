import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_LICENSE_PREFERENCES,
  readLicensePreferences,
  writeLicensePreferences,
} from "@/lib/preferences";

const PRODUCT = "prod_abc123";

class MemoryStorage {
  private data = new Map<string, string>();
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.data.set(key, value);
  }
  removeItem(key: string) {
    this.data.delete(key);
  }
  get size() {
    return this.data.size;
  }
  keys() {
    return [...this.data.keys()];
  }
  raw(key: string) {
    return this.data.get(key);
  }
}

let storage: MemoryStorage;

beforeEach(() => {
  storage = new MemoryStorage();
  vi.stubGlobal("localStorage", storage);
});

describe("license creation preferences", () => {
  it("returns defaults when nothing has been stored", () => {
    expect(readLicensePreferences(PRODUCT)).toEqual(DEFAULT_LICENSE_PREFERENCES);
  });

  it("round-trips the settings a developer chose", () => {
    writeLicensePreferences(PRODUCT, {
      mode: "duration",
      duration: "365d",
      hwidLocked: false,
      quantity: 25,
    });

    expect(readLicensePreferences(PRODUCT)).toEqual({
      mode: "duration",
      duration: "365d",
      hwidLocked: false,
      quantity: 25,
    });
  });

  it("keeps preferences separate per product", () => {
    // Different products often have genuinely different licensing shapes, so
    // one product's 90-day default must not leak into another's.
    writeLicensePreferences(PRODUCT, { ...DEFAULT_LICENSE_PREFERENCES, quantity: 50 });
    expect(readLicensePreferences("prod_other").quantity).toBe(1);
  });
});

describe("license creation preferences — what is never stored", () => {
  it("stores only the four approved keys", () => {
    writeLicensePreferences(PRODUCT, {
      mode: "date",
      duration: "30d",
      hwidLocked: true,
      quantity: 3,
    });

    const stored = JSON.parse(storage.raw(storage.keys()[0]!)!) as Record<string, unknown>;
    expect(Object.keys(stored).sort()).toEqual([
      "duration",
      "hwidLocked",
      "mode",
      "quantity",
    ]);
  });

  it("cannot be made to persist a label, notes or a key", () => {
    // The type forbids it, but localStorage is also where a plaintext key
    // would do the most damage, so the writer projects explicitly rather than
    // spreading whatever it was handed.
    writeLicensePreferences(PRODUCT, {
      ...DEFAULT_LICENSE_PREFERENCES,
      // @ts-expect-error deliberately passing fields the type forbids
      label: "Acme Corp",
      notes: "private",
      licenseKey: "KEYREN-AAAA-BBBB-CCCC-DDDD",
    });

    const serialized = storage.raw(storage.keys()[0]!)!;
    expect(serialized).not.toContain("Acme");
    expect(serialized).not.toContain("KEYREN");
    expect(serialized).not.toContain("private");
  });
});

describe("license creation preferences — untrusted storage", () => {
  it("falls back to defaults for malformed JSON", () => {
    storage.setItem(`keyren:license-prefs:${PRODUCT}`, "{not json");
    expect(readLicensePreferences(PRODUCT)).toEqual(DEFAULT_LICENSE_PREFERENCES);
  });

  it("rejects an unknown expiration mode", () => {
    storage.setItem(
      `keyren:license-prefs:${PRODUCT}`,
      JSON.stringify({ mode: "forever", duration: "30d", hwidLocked: true, quantity: 1 }),
    );
    expect(readLicensePreferences(PRODUCT).mode).toBe("permanent");
  });

  it("rejects an unknown duration", () => {
    storage.setItem(
      `keyren:license-prefs:${PRODUCT}`,
      JSON.stringify({ mode: "duration", duration: "999y", hwidLocked: true, quantity: 1 }),
    );
    expect(readLicensePreferences(PRODUCT).duration).toBe("30d");
  });

  it("caps a tampered quantity at the batch maximum", () => {
    // Hand-edited storage must not become a way to issue 10,000 licenses in
    // one click.
    storage.setItem(
      `keyren:license-prefs:${PRODUCT}`,
      JSON.stringify({ mode: "permanent", duration: "30d", hwidLocked: true, quantity: 10000 }),
    );
    expect(readLicensePreferences(PRODUCT).quantity).toBe(100);
  });

  it("floors a tampered quantity at one", () => {
    storage.setItem(
      `keyren:license-prefs:${PRODUCT}`,
      JSON.stringify({ mode: "permanent", duration: "30d", hwidLocked: true, quantity: -5 }),
    );
    expect(readLicensePreferences(PRODUCT).quantity).toBe(1);
  });

  it("ignores extra keys someone added by hand", () => {
    storage.setItem(
      `keyren:license-prefs:${PRODUCT}`,
      JSON.stringify({ ...DEFAULT_LICENSE_PREFERENCES, licenseKey: "KEYREN-X" }),
    );
    expect(readLicensePreferences(PRODUCT)).toEqual(DEFAULT_LICENSE_PREFERENCES);
  });
});

describe("license creation preferences — unavailable storage", () => {
  it("returns defaults rather than throwing when storage is absent", () => {
    // Private browsing and some enterprise policies make localStorage throw on
    // access. That must not stop a developer generating a license.
    vi.stubGlobal("localStorage", undefined);
    expect(readLicensePreferences(PRODUCT)).toEqual(DEFAULT_LICENSE_PREFERENCES);
  });

  it("swallows a write failure silently", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => null,
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    });

    expect(() =>
      writeLicensePreferences(PRODUCT, DEFAULT_LICENSE_PREFERENCES),
    ).not.toThrow();
  });

  it("survives a getItem that throws", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => undefined,
    });

    expect(readLicensePreferences(PRODUCT)).toEqual(DEFAULT_LICENSE_PREFERENCES);
  });
});
