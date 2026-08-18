import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ApplicationSwitcher } from "@/components/dashboard/application-switcher";

const push = vi.fn();
let pathname = "/dashboard";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => pathname,
}));

const APPLICATIONS = [
  { id: "app_alpha", name: "Alpha Tool", disabled: false },
  { id: "app_beta", name: "Beta Suite", disabled: true },
] as const;

function renderSwitcher(
  at: string,
  fallbackId: string | null = "app_alpha",
  applications: readonly { id: string; name: string; disabled: boolean }[] = APPLICATIONS,
) {
  pathname = at;
  render(<ApplicationSwitcher applications={applications} fallbackId={fallbackId} />);
  return userEvent.setup();
}

beforeEach(() => {
  push.mockClear();
});

describe("ApplicationSwitcher — which application is current", () => {
  it("names the application from the URL", () => {
    renderSwitcher("/dashboard/applications/app_beta");
    expect(screen.getByRole("button", { name: /Beta Suite/ })).toBeTruthy();
  });

  it("names the resolved application on a page with none in the path", () => {
    // The whole point of this release: there is no "All applications" state to
    // fall into on the workspace pages.
    renderSwitcher("/dashboard", "app_beta");
    expect(screen.getByRole("button", { name: /Beta Suite/ })).toBeTruthy();
  });

  it("lets the URL outrank the remembered application", () => {
    renderSwitcher("/dashboard/applications/app_alpha", "app_beta");
    expect(screen.getByRole("button", { name: /Alpha Tool/ })).toBeTruthy();
  });

  it("never offers an All applications entry", async () => {
    const user = renderSwitcher("/dashboard");
    await user.click(screen.getByRole("button", { name: /Alpha Tool/ }));
    expect(screen.queryByText("All applications")).toBeNull();
  });

  it("marks a disabled application in the list", async () => {
    const user = renderSwitcher("/dashboard/applications/app_alpha");
    await user.click(screen.getByRole("button", { name: /Alpha Tool/ }));

    // Beta is off; the developer should be able to see that without opening it.
    const beta = screen.getByRole("menuitem", { name: /Beta Suite/ });
    expect(beta.querySelector('[aria-label="Disabled"]')).toBeTruthy();
  });

  it("falls back to the resolved application for an id the developer does not own", () => {
    // A hand-typed or stale id resolves to nothing rather than being echoed
    // back as though it were real — and there is still an application in scope.
    renderSwitcher("/dashboard/applications/app_someone_else", "app_alpha");
    expect(screen.getByRole("button", { name: /Alpha Tool/ })).toBeTruthy();
  });

  it("says so plainly when the developer owns nothing", async () => {
    const user = renderSwitcher("/dashboard", null, []);
    const trigger = screen.getByRole("button", { name: /No applications yet/ });
    await user.click(trigger);

    expect(screen.getByText("New application")).toBeTruthy();
    expect(screen.queryByRole("menuitem", { name: /Alpha Tool/ })).toBeNull();
  });
});

describe("ApplicationSwitcher — switching keeps the section", () => {
  it("stays on licenses when switching application", async () => {
    // Changing the subject, not the place.
    const user = renderSwitcher("/dashboard/applications/app_alpha/licenses");

    await user.click(screen.getByRole("button", { name: /Alpha Tool/ }));
    await user.click(screen.getByRole("menuitem", { name: /Beta Suite/ }));

    expect(push).toHaveBeenCalledWith("/dashboard/applications/app_beta/licenses");
  });

  it("stays on the overview when switching from an overview", async () => {
    const user = renderSwitcher("/dashboard/applications/app_alpha");

    await user.click(screen.getByRole("button", { name: /Alpha Tool/ }));
    await user.click(screen.getByRole("menuitem", { name: /Beta Suite/ }));

    expect(push).toHaveBeenCalledWith("/dashboard/applications/app_beta");
  });

  it("preserves a deeper section rather than truncating to the application root", async () => {
    const user = renderSwitcher("/dashboard/applications/app_alpha/licenses/extra");

    await user.click(screen.getByRole("button", { name: /Alpha Tool/ }));
    await user.click(screen.getByRole("menuitem", { name: /Beta Suite/ }));

    expect(push).toHaveBeenCalledWith("/dashboard/applications/app_beta/licenses/extra");
  });

  it("opens the application overview when picking from a workspace page", async () => {
    // There is no section to carry across from /dashboard, and a pick that
    // changed a label without going anywhere would read as a broken control.
    const user = renderSwitcher("/dashboard", "app_alpha");

    await user.click(screen.getByRole("button", { name: /Alpha Tool/ }));
    await user.click(screen.getByRole("menuitem", { name: /Beta Suite/ }));

    expect(push).toHaveBeenCalledWith("/dashboard/applications/app_beta");
  });

  it("opens the application overview when picking from the applications list", async () => {
    const user = renderSwitcher("/dashboard/applications", "app_alpha");

    await user.click(screen.getByRole("button", { name: /Alpha Tool/ }));
    await user.click(screen.getByRole("menuitem", { name: /Beta Suite/ }));

    expect(push).toHaveBeenCalledWith("/dashboard/applications/app_beta");
  });
});
