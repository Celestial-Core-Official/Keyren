import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { ApplyPageSizePreference } from "@/components/licenses/apply-page-size-preference";
import { clearStoredPreferences, writeDisplayPreferences } from "@/lib/preferences";

const params = vi.hoisted(() => ({ setParams: vi.fn() }));
vi.mock("@/components/dashboard/use-query-params", () => ({
  useQueryParams: () => params,
}));

beforeEach(() => {
  clearStoredPreferences();
  params.setParams.mockClear();
});

/**
 * Settings offers a default page size, but the list is paged in SQL on the
 * server and the preference lives in `localStorage`, which the server cannot
 * see. Without this the control wrote a value nothing read, and a developer
 * who chose 100 still got 25.
 */
describe("ApplyPageSizePreference", () => {
  it("puts the developer's default into the URL", () => {
    writeDisplayPreferences({ pageSize: 100, showLocalTime: false });

    render(<ApplyPageSizePreference current={25} />);

    // Written into the URL rather than applied behind it: a view showing 100
    // licenses should say so, and stay that way when bookmarked or shared.
    expect(params.setParams).toHaveBeenCalledWith({ pageSize: 100, page: null });
  });

  it("returns to the first page, which is the only one certain to exist", () => {
    writeDisplayPreferences({ pageSize: 100, showLocalTime: false });

    render(<ApplyPageSizePreference current={25} />);

    expect(params.setParams.mock.calls[0]![0]).toMatchObject({ page: null });
  });

  it("does nothing when the page already matches the preference", () => {
    writeDisplayPreferences({ pageSize: 50, showLocalTime: false });

    render(<ApplyPageSizePreference current={50} />);

    expect(params.setParams).not.toHaveBeenCalled();
  });

  it("does nothing for a developer who never changed the default", () => {
    render(<ApplyPageSizePreference current={25} />);

    expect(params.setParams).not.toHaveBeenCalled();
  });
});
