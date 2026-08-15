import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LicenseRowActions } from "@/components/licenses/license-row-actions";
import { EditLicenseDialog } from "@/components/licenses/edit-license-dialog";
import { actionFailure, actionSuccess } from "@/lib/actions/state";
import type { LicenseListItem } from "@/lib/licenses/types";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

const actions = vi.hoisted(() => ({
  revokeLicenseAction: vi.fn(),
  restoreLicenseAction: vi.fn(),
  resetActivationAction: vi.fn(),
  deleteLicenseAction: vi.fn(),
  updateLicenseDetailsAction: vi.fn(),
}));

vi.mock("@/app/dashboard/products/[productId]/licenses/actions", () => actions);

const NOW = new Date("2026-08-15T12:00:00.000Z");

function license(overrides: Partial<LicenseListItem> = {}): LicenseListItem {
  return {
    id: "lic_1",
    productId: "prod_abc",
    keyLast4: "WXYZ",
    label: "Acme Corp",
    notes: null,
    status: "active",
    effectiveStatus: "active",
    expiresAt: null,
    hwidLocked: true,
    createdAt: NOW,
    updatedAt: NOW,
    revokedAt: null,
    activation: null,
    ...overrides,
  };
}

beforeEach(() => {
  toast.success.mockClear();
  toast.error.mockClear();
  for (const action of Object.values(actions)) {
    action.mockReset();
    action.mockResolvedValue(actionSuccess("Done.", null));
  }
});

describe("LicenseRowActions — the contextual action", () => {
  it("offers Revoke in the row for an active, unbound license", () => {
    render(<LicenseRowActions license={license()} productId="prod_abc" />);
    expect(screen.getByRole("button", { name: "Revoke" })).toBeTruthy();
  });

  it("offers Reset in the row for a locked, bound license", () => {
    render(
      <LicenseRowActions
        license={license({ activation: { activatedAt: NOW, lastSeenAt: NOW } })}
        productId="prod_abc"
      />,
    );
    expect(screen.getByRole("button", { name: "Reset" })).toBeTruthy();
  });

  it("offers Restore in the row for a revoked license", () => {
    render(
      <LicenseRowActions
        license={license({ status: "revoked", effectiveStatus: "revoked" })}
        productId="prod_abc"
      />,
    );
    expect(screen.getByRole("button", { name: "Restore" })).toBeTruthy();
  });

  it("submits the license and product ids, and never an owner", async () => {
    const user = userEvent.setup();
    render(<LicenseRowActions license={license()} productId="prod_abc" />);

    await user.click(screen.getByRole("button", { name: "Revoke" }));

    await waitFor(() => expect(actions.revokeLicenseAction).toHaveBeenCalled());
    const formData = actions.revokeLicenseAction.mock.calls[0]![1] as FormData;
    expect(formData.get("licenseId")).toBe("lic_1");
    expect(formData.get("productId")).toBe("prod_abc");
    expect(formData.get("ownerId")).toBeNull();
  });

  it("confirms a successful action rather than staying silent", async () => {
    actions.revokeLicenseAction.mockResolvedValue(
      actionSuccess("Revoked Acme Corp.", null),
    );
    const user = userEvent.setup();
    render(<LicenseRowActions license={license()} productId="prod_abc" />);

    await user.click(screen.getByRole("button", { name: "Revoke" }));

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Revoked Acme Corp."));
  });

  it("surfaces a failure rather than swallowing it", async () => {
    actions.revokeLicenseAction.mockResolvedValue(actionFailure("License not found."));
    const user = userEvent.setup();
    render(<LicenseRowActions license={license()} productId="prod_abc" />);

    await user.click(screen.getByRole("button", { name: "Revoke" }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("License not found."));
  });
});

describe("LicenseRowActions — permanent deletion", () => {
  async function openDeleteDialog(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole("button", { name: /more actions/i }));
    await user.click(await screen.findByText("Delete permanently"));
  }

  it("keeps the delete button disabled until DELETE is typed exactly", async () => {
    const user = userEvent.setup();
    render(<LicenseRowActions license={license()} productId="prod_abc" />);
    await openDeleteDialog(user);

    const confirm = screen.getByRole("button", { name: "Delete permanently" });
    expect(confirm.hasAttribute("disabled")).toBe(true);

    await user.type(screen.getByLabelText(/type/i), "delete");
    expect(confirm.hasAttribute("disabled")).toBe(true);

    await user.clear(screen.getByLabelText(/type/i));
    await user.type(screen.getByLabelText(/type/i), "DELETE");
    expect(confirm.hasAttribute("disabled")).toBe(false);
  });

  it("names the license it is about to erase", async () => {
    const user = userEvent.setup();
    render(<LicenseRowActions license={license()} productId="prod_abc" />);
    await openDeleteDialog(user);

    expect(screen.getByText("KEYREN-••••-••••-••••-WXYZ")).toBeTruthy();
    expect(screen.getByText(/\(Acme Corp\)/)).toBeTruthy();
  });

  it("offers revoking as the reversible alternative", async () => {
    const user = userEvent.setup();
    render(<LicenseRowActions license={license()} productId="prod_abc" />);
    await openDeleteDialog(user);

    expect(screen.getByText(/revoke it instead/i)).toBeTruthy();
  });

  it("forgets a typed confirmation when the dialog is cancelled", async () => {
    // Otherwise reopening the dialog starts one click away from a permanent
    // deletion the developer only opened it to look at.
    const user = userEvent.setup();
    render(<LicenseRowActions license={license()} productId="prod_abc" />);

    await openDeleteDialog(user);
    await user.type(screen.getByLabelText(/type/i), "DELETE");
    await user.click(screen.getByRole("button", { name: /cancel/i }));

    await openDeleteDialog(user);
    expect((screen.getByLabelText(/type/i) as HTMLInputElement).value).toBe("");
    expect(
      screen.getByRole("button", { name: "Delete permanently" }).hasAttribute("disabled"),
    ).toBe(true);
  });
});

describe("EditLicenseDialog", () => {
  function renderEdit(overrides: Partial<LicenseListItem> = {}) {
    const onOpenChange = vi.fn();
    const view = render(
      <EditLicenseDialog
        license={license(overrides)}
        productId="prod_abc"
        open
        onOpenChange={onOpenChange}
      />,
    );
    return { user: userEvent.setup(), onOpenChange, view };
  }

  it("prefills the stored label and notes", () => {
    renderEdit({ label: "Acme Corp", notes: "Chargeback risk" });

    expect((screen.getByLabelText("Label") as HTMLInputElement).value).toBe("Acme Corp");
    expect((screen.getByLabelText("Notes") as HTMLTextAreaElement).value).toBe(
      "Chargeback risk",
    );
  });

  it("starts blank for a license with no details", () => {
    renderEdit({ label: null, notes: null });

    expect((screen.getByLabelText("Label") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("Notes") as HTMLTextAreaElement).value).toBe("");
  });

  it("says plainly that neither field reaches customers", () => {
    renderEdit();
    expect(document.body.textContent).toMatch(
      /neither is ever returned by the verification API/i,
    );
  });

  it("submits the edited values with the license identity", async () => {
    const { user } = renderEdit({ label: "Old" });

    await user.clear(screen.getByLabelText("Label"));
    await user.type(screen.getByLabelText("Label"), "New label");
    await user.click(screen.getByRole("button", { name: /save details/i }));

    await waitFor(() => expect(actions.updateLicenseDetailsAction).toHaveBeenCalled());
    const formData = actions.updateLicenseDetailsAction.mock.calls[0]![1] as FormData;
    expect(formData.get("label")).toBe("New label");
    expect(formData.get("licenseId")).toBe("lic_1");
  });

  it("closes itself on success", async () => {
    actions.updateLicenseDetailsAction.mockResolvedValue(
      actionSuccess("Saved details for Acme Corp.", null),
    );
    const { user, onOpenChange } = renderEdit();

    await user.click(screen.getByRole("button", { name: /save details/i }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(toast.success).toHaveBeenCalledWith("Saved details for Acme Corp.");
  });

  it("stays open and marks the field when validation fails", async () => {
    actions.updateLicenseDetailsAction.mockResolvedValue(
      actionFailure("Label must be 120 characters or fewer", {
        label: "Label must be 120 characters or fewer",
      }),
    );
    const { user, onOpenChange } = renderEdit();

    await user.click(screen.getByRole("button", { name: /save details/i }));

    await waitFor(() =>
      expect(screen.getByText("Label must be 120 characters or fewer")).toBeTruthy(),
    );
    expect(screen.getByLabelText("Label").getAttribute("aria-invalid")).toBe("true");
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("enforces the column limits in the inputs themselves", () => {
    renderEdit();

    expect(screen.getByLabelText("Label").getAttribute("maxLength")).toBe("120");
    expect(screen.getByLabelText("Notes").getAttribute("maxLength")).toBe("1000");
  });
});
