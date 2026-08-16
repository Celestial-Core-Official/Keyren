import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";
import { DayStamp, RelativeTime } from "@/components/dashboard/relative-time";
import { clearStoredPreferences, writeDisplayPreferences } from "@/lib/preferences";
import { formatExactLocal } from "@/lib/format/date";

const NOW = new Date("2026-08-16T12:00:00.000Z");
const EXPIRY = new Date("2026-12-31T23:59:59.999Z");

beforeEach(() => {
  // Through the store rather than by clearing storage directly: snapshots are
  // cached for `useSyncExternalStore`, and only a writer invalidates them.
  clearStoredPreferences();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
});

describe("RelativeTime", () => {
  it("shows the exact UTC instant behind the relative label", () => {
    render(<RelativeTime value={new Date(NOW.getTime() - 3 * 86_400_000)} />);

    const label = screen.getByText("3 days ago");
    expect(label.getAttribute("title")).toBe("Aug 13, 2026 at 12:00 UTC");
  });

  it("adds local time beneath the UTC instant when the setting is on", () => {
    writeDisplayPreferences({ pageSize: 25, showLocalTime: true });

    render(<RelativeTime value={new Date(NOW.getTime() - 3 * 86_400_000)} />);

    const title = screen.getByText("3 days ago").getAttribute("title") ?? "";
    const [utc, local] = title.split("\n");

    // UTC stays the primary reading; local is strictly the second line.
    expect(utc).toBe("Aug 13, 2026 at 12:00 UTC");
    expect(local).toBeTruthy();
  });

  it("leaves the visible label alone either way", () => {
    writeDisplayPreferences({ pageSize: 25, showLocalTime: true });

    render(<RelativeTime value={new Date(NOW.getTime() - 3 * 86_400_000)} />);

    expect(screen.getByText("3 days ago")).toBeTruthy();
  });
});

describe("DayStamp", () => {
  it("shows the calendar day in UTC and nothing else by default", () => {
    render(<DayStamp value={EXPIRY} />);

    expect(screen.getByText("Dec 31, 2026")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/GMT|UTC\+|Jan 1/);
  });

  it("adds a secondary local line when the setting is on", () => {
    writeDisplayPreferences({ pageSize: 25, showLocalTime: true });

    render(<DayStamp value={EXPIRY} />);

    // The UTC day is still the one being read. An expiry is stored as the last
    // instant of a UTC day, so east of UTC the local equivalent falls on the
    // following date — which is exactly what a developer turns this on to see,
    // and exactly why it must never replace the UTC line.
    expect(screen.getByText("Dec 31, 2026")).toBeTruthy();
    expect(screen.getByText(formatExactLocal(EXPIRY))).toBeTruthy();
  });
});

/**
 * Both components read the clock and the preference store, neither of which
 * the server can agree with — and a mismatch is not a cosmetic warning. React
 * discards the server HTML for the whole root and re-renders it on the client,
 * which is how a mismatch here surfaces as an unrelated component misbehaving
 * elsewhere on the page.
 */
describe("hydration", () => {
  async function hydrationErrorsFor(
    ui: React.ReactElement,
    advanceMs = 0,
  ): Promise<string[]> {
    const tree = <div>{ui}</div>;

    const storage = globalThis.localStorage;
    Reflect.deleteProperty(globalThis, "localStorage");
    let html: string;
    try {
      html = renderToString(tree);
    } finally {
      Object.defineProperty(globalThis, "localStorage", {
        value: storage,
        configurable: true,
        writable: true,
      });
    }

    // The client renders later than the server did. That gap is the whole bug:
    // a label rendered as "just now" server-side becomes "1 minute ago" by the
    // time hydration runs.
    vi.setSystemTime(new Date(NOW.getTime() + advanceMs));

    const container = document.createElement("div");
    container.innerHTML = html;
    document.body.append(container);

    const errors: string[] = [];
    await act(async () => {
      hydrateRoot(container, tree, {
        onRecoverableError: (error) => {
          errors.push(error instanceof Error ? error.message : String(error));
        },
      });
    });

    return errors;
  }

  it("survives a relative label crossing a bucket boundary between render and hydration", async () => {
    // "just now" on the server, "1 minute ago" by hydration — the labels a
    // freshly issued license wears, and the most common way this fires.
    const errors = await hydrationErrorsFor(
      <RelativeTime value={new Date(NOW.getTime() - 30_000)} />,
      40_000,
    );

    expect(errors).toEqual([]);
  });

  it("survives the local-time preference being on in the browser only", async () => {
    writeDisplayPreferences({ pageSize: 25, showLocalTime: true });

    const errors = await hydrationErrorsFor(<DayStamp value={EXPIRY} />);

    expect(errors).toEqual([]);
  });
});
