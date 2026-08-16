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

function renderSwitcher(at: string) {
  pathname = at;
  render(<ApplicationSwitcher applications={APPLICATIONS} />);
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

  it("reads as All applications outside any one of them", () => {
    renderSwitcher("/dashboard");
    expect(screen.getByRole("button", { name: /Choose an application/ })).toBeTruthy();
  });

  it("marks a disabled application in the list", async () => {
    const user = renderSwitcher("/dashboard/applications/app_alpha");
    await user.click(screen.getByRole("button", { name: /Alpha Tool/ }));

    // Beta is off; the developer should be able to see that without opening it.
    const beta = screen.getByRole("menuitem", { name: /Beta Suite/ });
    expect(beta.querySelector('[aria-label="Disabled"]')).toBeTruthy();
  });

  it("does not claim an application the developer does not own", () => {
    // A hand-typed or stale id resolves to no application rather than being
    // echoed back as though it were real.
    renderSwitcher("/dashboard/applications/app_someone_else");
    expect(screen.getByRole("button", { name: /Choose an application/ })).toBeTruthy();
  });
});

describe("ApplicationSwitcher — switching keeps the section", () => {
  it("stays on licenses when switching application", async () => {
    // The whole point of the switcher: changing the subject, not the place.
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

  it("sends you to an application overview when switching from outside one", async () => {
    const user = renderSwitcher("/dashboard/settings");

    await user.click(screen.getByRole("button", { name: /Choose an application/ }));
    await user.click(screen.getByRole("menuitem", { name: /Alpha Tool/ }));

    expect(push).toHaveBeenCalledWith("/dashboard/applications/app_alpha");
  });
});
