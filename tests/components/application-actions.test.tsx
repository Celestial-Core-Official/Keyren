import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ApplicationActions } from "@/components/applications/application-actions";
import { actionFailure, actionSuccess } from "@/lib/actions/state";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

const actions = vi.hoisted(() => ({
  createApplicationAction: vi.fn(),
  deleteApplicationAction: vi.fn(),
  renameApplicationAction: vi.fn(),
  setApplicationDisabledAction: vi.fn(),
}));
vi.mock("@/app/dashboard/applications/actions", () => actions);

beforeEach(() => {
  toast.success.mockClear();
  toast.error.mockClear();
  for (const action of Object.values(actions)) {
    action.mockReset();
    action.mockResolvedValue(actionSuccess("Done.", null));
  }
});

function openMenu(user: ReturnType<typeof userEvent.setup>) {
  return user.click(screen.getByRole("button", { name: "Actions for Acme" }));
}

describe("ApplicationActions — the status entry", () => {
  it("offers Disable for a live application", async () => {
    const user = userEvent.setup();
    render(<ApplicationActions applicationId="app_ABC123" name="Acme" disabled={false} />);
    await openMenu(user);

    expect(await screen.findByText("Disable")).toBeTruthy();
    expect(screen.queryByText("Enable")).toBeNull();
  });

  it("offers Enable for a disabled application", async () => {
    // The state a developer reaches this menu to get out of.
    const user = userEvent.setup();
    render(<ApplicationActions applicationId="app_ABC123" name="Acme" disabled />);
    await openMenu(user);

    expect(await screen.findByText("Enable")).toBeTruthy();
    expect(screen.queryByText("Disable")).toBeNull();
  });

  it("asks before disabling", async () => {
    const user = userEvent.setup();
    render(<ApplicationActions applicationId="app_ABC123" name="Acme" disabled={false} />);
    await openMenu(user);
    await user.click(await screen.findByText("Disable"));

    expect(await screen.findByText(/Disable Acme\?/)).toBeTruthy();
    expect(actions.setApplicationDisabledAction).not.toHaveBeenCalled();
  });

  it("submits the id and the intended end state once confirmed", async () => {
    const user = userEvent.setup();
    render(<ApplicationActions applicationId="app_ABC123" name="Acme" disabled={false} />);
    await openMenu(user);
    await user.click(await screen.findByText("Disable"));
    await user.click(await screen.findByRole("button", { name: "Disable application" }));

    await waitFor(() => expect(actions.setApplicationDisabledAction).toHaveBeenCalled());
    const formData = actions.setApplicationDisabledAction.mock.calls[0]![1] as FormData;
    expect(formData.get("applicationId")).toBe("app_ABC123");
    expect(formData.get("disabled")).toBe("true");
    expect(formData.get("ownerId")).toBeNull();
  });

  it("enables on the click, with nothing to confirm", async () => {
    const user = userEvent.setup();
    render(<ApplicationActions applicationId="app_ABC123" name="Acme" disabled />);
    await openMenu(user);
    await user.click(await screen.findByText("Enable"));

    await waitFor(() => expect(actions.setApplicationDisabledAction).toHaveBeenCalled());
    const formData = actions.setApplicationDisabledAction.mock.calls[0]![1] as FormData;
    expect(formData.get("applicationId")).toBe("app_ABC123");
    expect(formData.get("disabled")).toBe("false");
  });

  it("surfaces a failure rather than swallowing it", async () => {
    actions.setApplicationDisabledAction.mockResolvedValue(
      actionFailure("That submission arrived without an application. Reload and try again."),
    );
    const user = userEvent.setup();
    render(<ApplicationActions applicationId="app_ABC123" name="Acme" disabled />);
    await openMenu(user);
    await user.click(await screen.findByText("Enable"));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "That submission arrived without an application. Reload and try again.",
      ),
    );
  });
});

describe("ApplicationActions — the destructive entry is unchanged", () => {
  it("keeps the delete button disabled until the name is typed exactly", async () => {
    const user = userEvent.setup();
    render(<ApplicationActions applicationId="app_ABC123" name="Acme" disabled={false} />);
    await openMenu(user);
    await user.click(await screen.findByText("Delete application"));

    const confirm = screen.getByRole("button", { name: "Delete application" });
    expect(confirm.hasAttribute("disabled")).toBe(true);

    await user.type(screen.getByLabelText(/type/i), "Acme");
    expect(confirm.hasAttribute("disabled")).toBe(false);
  });
});
