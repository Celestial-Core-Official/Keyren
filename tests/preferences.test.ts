import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearStoredPreferences,
  DEFAULT_DISPLAY_PREFERENCES,
  DEFAULT_LICENSE_PREFERENCES,
  readDisplayPreferences,
  readGlobalDefaults,
  readLicensePreferences,
  readUiFlag,
  resolveLicensePreferences,
  writeDisplayPreferences,
  writeGlobalDefaults,
  writeLicensePreferences,
  writeUiFlag,
} from "@/lib/preferences";

const APPLICATION = "app_abc123";

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
  // `length` and `key(index)` are the enumeration half of the Storage
  // interface, which `clearStoredPreferences` walks to find its own keys.
  get length() {
    return this.data.size;
  }
  key(index: number) {
    return this.keys()[index] ?? null;
  }
}

let storage: MemoryStorage;

beforeEach(() => {
  storage = new MemoryStorage();
  vi.stubGlobal("localStorage", storage);
});

describe("license creation preferences", () => {
  it("returns defaults when nothing has been stored", () => {
    expect(readLicensePreferences(APPLICATION)).toEqual(DEFAULT_LICENSE_PREFERENCES);
  });

  it("round-trips the settings a developer chose", () => {
    writeLicensePreferences(APPLICATION, {
      mode: "duration",
      duration: "365d",
      hwidLocked: false,
      quantity: 25,
    });

    expect(readLicensePreferences(APPLICATION)).toEqual({
      mode: "duration",
      duration: "365d",
      hwidLocked: false,
      quantity: 25,
    });
  });

  it("keeps preferences separate per application", () => {
    // Different applications often have genuinely different licensing shapes, so
    // one application's 90-day default must not leak into another's.
    writeLicensePreferences(APPLICATION, { ...DEFAULT_LICENSE_PREFERENCES, quantity: 50 });
    expect(readLicensePreferences("app_other").quantity).toBe(1);
  });
});

describe("license creation preferences — what is never stored", () => {
  it("stores only the four approved keys", () => {
    writeLicensePreferences(APPLICATION, {
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
    writeLicensePreferences(APPLICATION, {
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
    storage.setItem(`keyren:license-prefs:${APPLICATION}`, "{not json");
    expect(readLicensePreferences(APPLICATION)).toEqual(DEFAULT_LICENSE_PREFERENCES);
  });

  it("rejects an unknown expiration mode", () => {
    storage.setItem(
      `keyren:license-prefs:${APPLICATION}`,
      JSON.stringify({ mode: "forever", duration: "30d", hwidLocked: true, quantity: 1 }),
    );
    expect(readLicensePreferences(APPLICATION).mode).toBe("permanent");
  });

  it("rejects an unknown duration", () => {
    storage.setItem(
      `keyren:license-prefs:${APPLICATION}`,
      JSON.stringify({ mode: "duration", duration: "999y", hwidLocked: true, quantity: 1 }),
    );
    expect(readLicensePreferences(APPLICATION).duration).toBe("30d");
  });

  it("caps a tampered quantity at the batch maximum", () => {
    // Hand-edited storage must not become a way to issue 10,000 licenses in
    // one click.
    storage.setItem(
      `keyren:license-prefs:${APPLICATION}`,
      JSON.stringify({ mode: "permanent", duration: "30d", hwidLocked: true, quantity: 10000 }),
    );
    expect(readLicensePreferences(APPLICATION).quantity).toBe(100);
  });

  it("floors a tampered quantity at one", () => {
    storage.setItem(
      `keyren:license-prefs:${APPLICATION}`,
      JSON.stringify({ mode: "permanent", duration: "30d", hwidLocked: true, quantity: -5 }),
    );
    expect(readLicensePreferences(APPLICATION).quantity).toBe(1);
  });

  it("ignores extra keys someone added by hand", () => {
    storage.setItem(
      `keyren:license-prefs:${APPLICATION}`,
      JSON.stringify({ ...DEFAULT_LICENSE_PREFERENCES, licenseKey: "KEYREN-X" }),
    );
    expect(readLicensePreferences(APPLICATION)).toEqual(DEFAULT_LICENSE_PREFERENCES);
  });
});

describe("license creation preferences — unavailable storage", () => {
  it("returns defaults rather than throwing when storage is absent", () => {
    // Private browsing and some enterprise policies make localStorage throw on
    // access. That must not stop a developer generating a license.
    vi.stubGlobal("localStorage", undefined);
    expect(readLicensePreferences(APPLICATION)).toEqual(DEFAULT_LICENSE_PREFERENCES);
  });

  it("swallows a write failure silently", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => null,
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    });

    expect(() =>
      writeLicensePreferences(APPLICATION, DEFAULT_LICENSE_PREFERENCES),
    ).not.toThrow();
  });

  it("survives a getItem that throws", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => undefined,
    });

    expect(readLicensePreferences(APPLICATION)).toEqual(DEFAULT_LICENSE_PREFERENCES);
  });
});

describe("account-wide defaults", () => {
  it("returns the built-in defaults when nothing has been stored", () => {
    expect(readGlobalDefaults()).toEqual(DEFAULT_LICENSE_PREFERENCES);
  });

  it("round-trips what the developer chose in Settings", () => {
    writeGlobalDefaults({
      mode: "duration",
      duration: "90d",
      hwidLocked: false,
      quantity: 10,
    });

    expect(readGlobalDefaults()).toEqual({
      mode: "duration",
      duration: "90d",
      hwidLocked: false,
      quantity: 10,
    });
  });

  it("clamps a hand-edited quantity rather than trusting it", () => {
    storage.setItem(
      "keyren:defaults",
      JSON.stringify({ mode: "permanent", duration: "30d", hwidLocked: true, quantity: 10_000 }),
    );

    expect(readGlobalDefaults().quantity).toBe(100);
  });

  it("refuses to store anything beyond the four permitted fields", () => {
    writeGlobalDefaults({
      mode: "permanent",
      duration: "30d",
      hwidLocked: true,
      quantity: 1,
      // A label and a key must never reach storage, even if a caller passes them.
      label: "Acme Corp",
      licenseKey: "KEYREN-AAAA-BBBB-CCCC-DDDD",
    } as never);

    const stored = JSON.parse(storage.raw("keyren:defaults") as string);
    expect(Object.keys(stored).sort()).toEqual([
      "duration",
      "hwidLocked",
      "mode",
      "quantity",
    ]);
  });
});

describe("resolving what a creation form opens with", () => {
  it("prefers an application's own memory over the account default", () => {
    writeGlobalDefaults({ mode: "duration", duration: "7d", hwidLocked: false, quantity: 5 });
    writeLicensePreferences(APPLICATION, {
      mode: "permanent",
      duration: "30d",
      hwidLocked: true,
      quantity: 1,
    });

    expect(resolveLicensePreferences(APPLICATION).mode).toBe("permanent");
    expect(resolveLicensePreferences(APPLICATION).quantity).toBe(1);
  });

  it("seeds an application that has never issued a license with the account default", () => {
    writeGlobalDefaults({ mode: "duration", duration: "7d", hwidLocked: false, quantity: 5 });

    expect(resolveLicensePreferences("app_never_used")).toEqual({
      mode: "duration",
      duration: "7d",
      hwidLocked: false,
      quantity: 5,
    });
  });

  it("does not treat an application stored as the defaults as untouched", () => {
    // An application deliberately set to match the account default must still count
    // as having its own memory, or changing the default would silently rewrite it.
    writeLicensePreferences(APPLICATION, DEFAULT_LICENSE_PREFERENCES);
    writeGlobalDefaults({ mode: "duration", duration: "365d", hwidLocked: false, quantity: 50 });

    expect(resolveLicensePreferences(APPLICATION)).toEqual(DEFAULT_LICENSE_PREFERENCES);
  });

  it("falls back to the built-in defaults when neither is stored", () => {
    expect(resolveLicensePreferences("app_nothing")).toEqual(DEFAULT_LICENSE_PREFERENCES);
  });
});

describe("display preferences", () => {
  it("defaults to 25 per page with local time off", () => {
    expect(readDisplayPreferences()).toEqual(DEFAULT_DISPLAY_PREFERENCES);
  });

  it("round-trips a chosen page size and local-time setting", () => {
    writeDisplayPreferences({ pageSize: 100, showLocalTime: true });
    expect(readDisplayPreferences()).toEqual({ pageSize: 100, showLocalTime: true });
  });

  it("rejects a page size that is not one of the offered sizes", () => {
    storage.setItem("keyren:display", JSON.stringify({ pageSize: 7, showLocalTime: false }));
    expect(readDisplayPreferences().pageSize).toBe(DEFAULT_DISPLAY_PREFERENCES.pageSize);
  });

  it("degrades a tampered showLocalTime to the default", () => {
    storage.setItem("keyren:display", JSON.stringify({ pageSize: 50, showLocalTime: "yes" }));

    const result = readDisplayPreferences();
    expect(result.pageSize).toBe(50);
    expect(result.showLocalTime).toBe(false);
  });
});

describe("resetting remembered settings", () => {
  it("clears every keyren key", () => {
    writeGlobalDefaults({ mode: "duration", duration: "7d", hwidLocked: false, quantity: 5 });
    writeDisplayPreferences({ pageSize: 100, showLocalTime: true });
    writeLicensePreferences(APPLICATION, DEFAULT_LICENSE_PREFERENCES);
    writeUiFlag("onboarding-dismissed", true);

    clearStoredPreferences();

    expect(storage.keys()).toEqual([]);
    expect(readGlobalDefaults()).toEqual(DEFAULT_LICENSE_PREFERENCES);
    expect(readDisplayPreferences()).toEqual(DEFAULT_DISPLAY_PREFERENCES);
    expect(readUiFlag("onboarding-dismissed")).toBe(false);
  });

  it("leaves keys belonging to anything else on the origin alone", () => {
    // Clerk's session lives on this origin too. Clearing it would sign the
    // developer out as a side effect of resetting a dropdown.
    storage.setItem("__clerk_db_jwt", "session-token");
    storage.setItem("theme", "dark");
    writeGlobalDefaults(DEFAULT_LICENSE_PREFERENCES);

    clearStoredPreferences();

    expect(storage.raw("__clerk_db_jwt")).toBe("session-token");
    expect(storage.raw("theme")).toBe("dark");
  });
});
