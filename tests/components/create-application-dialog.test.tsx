import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CreateApplicationDialog } from "@/components/applications/create-application-dialog";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/app/dashboard/applications/actions", () => ({
  createApplicationAction: vi.fn(),
}));

const params = vi.hoisted(() => ({ setParams: vi.fn() }));
vi.mock("@/components/dashboard/use-query-params", () => ({
  useQueryParams: () => params,
}));

let user: ReturnType<typeof userEvent.setup>;

beforeEach(() => {
  user = userEvent.setup();
  params.setParams.mockClear();
  document.body.innerHTML = "";
});

/**
 * The switcher and the command palette offer "New application" from anywhere
 * in the dashboard. Neither can open a dialog that lives on a page it is not
 * on, so both navigate to `?new=1` and the page has to honour it — otherwise
 * the developer lands on the list and has to find the button again, which is
 * the friction those two entries exist to remove.
 */
describe("arriving with ?new=1", () => {
  it("opens the dialog on arrival", () => {
    render(<CreateApplicationDialog requested />);

    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByLabelText("Application name")).toBeTruthy();
  });

  it("stays shut without it", () => {
    render(<CreateApplicationDialog />);

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens when the parameter arrives on a page already rendered", () => {
    // Picking "New application" from the switcher while already on this page
    // changes the URL without remounting anything.
    const { rerender } = render(<CreateApplicationDialog />);
    expect(screen.queryByRole("dialog")).toBeNull();

    rerender(<CreateApplicationDialog requested />);

    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("clears the parameter when the dialog is dismissed", async () => {
    render(<CreateApplicationDialog requested />);

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    // Left behind, it would reopen the dialog on the next refresh or back
    // navigation.
    expect(params.setParams).toHaveBeenCalledWith({ new: null });
  });

  it("leaves the URL alone when the dialog was opened by its own button", async () => {
    render(<CreateApplicationDialog />);

    await user.click(screen.getByRole("button", { name: /New application/ }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(params.setParams).not.toHaveBeenCalled();
  });
});
