import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LicenseFilters } from "@/components/licenses/license-filters";
import { DEFAULT_LICENSE_QUERY, type LicenseQuery } from "@/lib/licenses/types";

const nav = vi.hoisted(() => ({
  replace: vi.fn(),
  search: "",
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: nav.replace, push: vi.fn() }),
  usePathname: () => "/dashboard/applications/app_abc/licenses",
  useSearchParams: () => new URLSearchParams(nav.search),
}));

beforeEach(() => {
  nav.replace.mockClear();
  nav.search = "";
});

function renderFilters(query: Partial<LicenseQuery> = {}, total = 12) {
  render(<LicenseFilters query={{ ...DEFAULT_LICENSE_QUERY, ...query }} total={total} />);
  return userEvent.setup();
}

/** The path the router was last asked to go to. */
function lastHref(): string {
  return nav.replace.mock.calls.at(-1)![0] as string;
}

/**
 * Picks a value from one of the filter controls.
 *
 * These were native `<select>` elements through Alpha_v2 and are Radix now, so
 * the interaction is open-then-choose rather than `selectOptions`, and the
 * option is named by its label rather than by its value.
 */
async function chooseFilter(
  user: ReturnType<typeof userEvent.setup>,
  control: string,
  option: string,
): Promise<void> {
  await user.click(screen.getByLabelText(control));
  await user.click(await screen.findByRole("option", { name: option }));
}

describe("LicenseFilters — search", () => {
  it("does not navigate on every keystroke", async () => {
    const user = renderFilters();
    await user.type(screen.getByLabelText("Search licenses"), "acme");

    expect(nav.replace).not.toHaveBeenCalled();
  });

  it("writes the term to the URL after the debounce", async () => {
    const user = renderFilters();
    await user.type(screen.getByLabelText("Search licenses"), "acme");

    await waitFor(() => expect(nav.replace).toHaveBeenCalled(), { timeout: 1500 });
    expect(lastHref()).toContain("q=acme");
  });

  it("trims the term before it reaches the URL", async () => {
    const user = renderFilters();
    await user.type(screen.getByLabelText("Search licenses"), "  acme  ");

    await waitFor(() => expect(nav.replace).toHaveBeenCalled(), { timeout: 1500 });
    expect(lastHref()).toContain("q=acme");
  });

  it("removes the parameter entirely when the box is emptied", async () => {
    nav.search = "q=acme";
    const user = renderFilters({ q: "acme" });

    await user.clear(screen.getByLabelText("Search licenses"));

    await waitFor(() => expect(nav.replace).toHaveBeenCalled(), { timeout: 1500 });
    expect(lastHref()).not.toContain("q=");
  });

  it("carries the term back into the box from the URL", () => {
    renderFilters({ q: "acme" });
    expect((screen.getByLabelText("Search licenses") as HTMLInputElement).value).toBe("acme");
  });

  it("is discoverable by the / shortcut", () => {
    renderFilters();
    expect(
      screen.getByLabelText("Search licenses").getAttribute("data-keyren-search"),
    ).toBe("true");
  });
});

describe("LicenseFilters — filters preserve one another", () => {
  it("keeps existing parameters when one control changes", async () => {
    // The whole reason for merging rather than rebuilding the query string.
    nav.search = "sort=label&status=revoked";
    const user = renderFilters({ sort: "label", status: "revoked" });

    await chooseFilter(user, "Filter by device lock", "Locked to a device");

    expect(lastHref()).toContain("sort=label");
    expect(lastHref()).toContain("status=revoked");
    expect(lastHref()).toContain("lock=locked");
  });

  it("returns to page one whenever a filter changes", async () => {
    // Page 4 of the old result set is rarely page 4 of the new one, and
    // landing on an empty page reads as data loss.
    nav.search = "page=4";
    const user = renderFilters({ page: 4 });

    await chooseFilter(user, "Filter by status", "Revoked");
    expect(lastHref()).not.toContain("page=");
  });

  it("drops a filter from the URL when it returns to its default", async () => {
    nav.search = "status=revoked";
    const user = renderFilters({ status: "revoked" });

    await chooseFilter(user, "Filter by status", "Any status");
    expect(lastHref()).not.toContain("status=");
  });

  it("keeps the chosen page size when filters change", async () => {
    // Page size is a preference, not a filter.
    nav.search = "pageSize=100";
    const user = renderFilters({ pageSize: 100 });

    await chooseFilter(user, "Filter by status", "Active");
    expect(lastHref()).toContain("pageSize=100");
  });
});

describe("LicenseFilters — active filter summary", () => {
  it("shows nothing extra when no filter is applied", () => {
    renderFilters();
    expect(screen.queryByRole("button", { name: /clear filters/i })).toBeNull();
  });

  it("states how many licenses match", () => {
    renderFilters({ status: "revoked" }, 3);
    expect(screen.getByText("3 licenses match")).toBeTruthy();
  });

  it("uses the singular for exactly one match", () => {
    renderFilters({ status: "revoked" }, 1);
    expect(screen.getByText("1 license matches")).toBeTruthy();
  });

  it("names each active filter as a chip", () => {
    renderFilters({ q: "acme", status: "revoked", lock: "locked" });

    // Scoped to the summary: "Revoked" is also an option inside the status
    // select, and matching that would prove nothing.
    const summary = within(screen.getByRole("group", { name: "Active filters" }));
    expect(summary.getByText("“acme”")).toBeTruthy();
    expect(summary.getByText("Revoked")).toBeTruthy();
    expect(summary.getByText("Locked to a device")).toBeTruthy();
  });

  it("clears every filter at once without touching the page size", async () => {
    nav.search = "q=acme&status=revoked&pageSize=50";
    const user = renderFilters({ q: "acme", status: "revoked", pageSize: 50 });

    await user.click(screen.getByRole("button", { name: /clear filters/i }));

    const href = lastHref();
    expect(href).not.toContain("q=");
    expect(href).not.toContain("status=");
    expect(href).toContain("pageSize=50");
  });
});
