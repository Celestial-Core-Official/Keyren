import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LicenseList } from "@/components/licenses/license-list";
import { eligibilityFor } from "@/components/licenses/license-selection-toolbar";
import { actionSuccess } from "@/lib/actions/state";
import type { LicenseListItem } from "@/lib/licenses/types";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

const download = vi.hoisted(() => ({ downloadTextFile: vi.fn() }));
vi.mock("@/lib/download", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/download")>()),
  downloadTextFile: download.downloadTextFile,
}));

const bulk = vi.hoisted(() => ({
  bulkLicenseAction: vi.fn(),
  exportSelectionAction: vi.fn(),
}));
vi.mock("@/app/dashboard/products/[productId]/licenses/bulk-actions", () => bulk);

vi.mock("@/app/dashboard/products/[productId]/licenses/actions", () => ({
  revokeLicenseAction: vi.fn(),
  restoreLicenseAction: vi.fn(),
  resetActivationAction: vi.fn(),
  deleteLicenseAction: vi.fn(),
  updateLicenseDetailsAction: vi.fn(),
}));

const NOW = new Date("2026-08-15T12:00:00.000Z");

function license(id: string, overrides: Partial<LicenseListItem> = {}): LicenseListItem {
  return {
    id,
    productId: "prod_abc",
    keyLast4: id.slice(-4).toUpperCase().padStart(4, "A"),
    label: `License ${id}`,
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

const ROWS = [license("lic_aaa1"), license("lic_bbb2"), license("lic_ccc3")];

beforeEach(() => {
  toast.success.mockClear();
  toast.error.mockClear();
  download.downloadTextFile.mockClear();
  bulk.bulkLicenseAction.mockReset();
  bulk.bulkLicenseAction.mockResolvedValue(
    actionSuccess("Revoked 3 licenses.", { changed: 3, skipped: 0, notFound: 0 }),
  );
  bulk.exportSelectionAction.mockReset();
  bulk.exportSelectionAction.mockResolvedValue(
    actionSuccess("Prepared 3 licenses for export.", {
      rows: ROWS.map((row) => ({
        label: row.label,
        maskedKey: `KEYREN-••••-••••-••••-${row.keyLast4}`,
        productId: row.productId,
        status: "active" as const,
        effectiveStatus: "active" as const,
        expiresAt: null,
        hwidLocked: true,
        activatedAt: null,
        lastSeenAt: null,
        createdAt: NOW.toISOString(),
      })),
    }),
  );
});

function renderList(rows: LicenseListItem[] = ROWS) {
  const view = render(
    <LicenseList licenses={rows} productId="prod_abc" productSlug="seliware-key" />,
  );
  return { user: userEvent.setup(), view };
}

/** The desktop table's checkboxes; the card list renders its own copies. */
function rowCheckbox(label: string) {
  return screen.getAllByRole("checkbox", { name: `Select ${label}` })[0]!;
}

function headerCheckbox() {
  return screen.getByRole("checkbox", { name: /select all licenses on this page/i });
}

describe("selection", () => {
  it("shows no toolbar until something is selected", () => {
    renderList();
    expect(screen.queryByRole("region", { name: /selected licenses/i })).toBeNull();
  });

  it("shows the toolbar and a count once a row is selected", async () => {
    const { user } = renderList();
    await user.click(rowCheckbox("License lic_aaa1"));

    expect(screen.getByRole("region", { name: /selected licenses/i })).toBeTruthy();
    expect(screen.getByText("1 selected")).toBeTruthy();
  });

  it("selects every row on the page from the header checkbox", async () => {
    const { user } = renderList();
    await user.click(headerCheckbox());

    expect(screen.getByText("3 selected")).toBeTruthy();
  });

  it("goes indeterminate when only some rows are selected", async () => {
    const { user } = renderList();
    await user.click(rowCheckbox("License lic_aaa1"));

    const header = headerCheckbox() as HTMLInputElement;
    expect(header.indeterminate).toBe(true);
    expect(header.checked).toBe(false);
  });

  it("becomes fully checked once every row is selected by hand", async () => {
    const { user } = renderList();
    for (const row of ROWS) await user.click(rowCheckbox(`License ${row.id}`));

    const header = headerCheckbox() as HTMLInputElement;
    expect(header.checked).toBe(true);
    expect(header.indeterminate).toBe(false);
  });

  it("clears the selection from the toolbar", async () => {
    const { user } = renderList();
    await user.click(headerCheckbox());
    await user.click(screen.getByRole("button", { name: /^clear$/i }));

    expect(screen.queryByRole("region", { name: /selected licenses/i })).toBeNull();
  });

  it("drops the selection when the underlying rows change", () => {
    // Filtering, sorting or paging replaces the rows; ids from the old view
    // must not stay selected and be acted on.
    const { view } = renderList();
    const header = headerCheckbox() as HTMLInputElement;
    header.click();

    view.rerender(
      <LicenseList
        licenses={[license("lic_zzz9")]}
        productId="prod_abc"
        productSlug="seliware-key"
      />,
    );

    expect(screen.queryByRole("region", { name: /selected licenses/i })).toBeNull();
  });
});

describe("bulk confirmation", () => {
  async function openConfirm(user: ReturnType<typeof userEvent.setup>, name: RegExp) {
    await user.click(headerCheckbox());
    const toolbar = screen.getByRole("region", { name: /selected licenses/i });
    await user.click(
      [...toolbar.querySelectorAll("button")].find((button) => name.test(button.textContent ?? ""))!,
    );
  }

  it("summarises how many will actually change", async () => {
    const rows = [
      license("lic_aaa1"),
      license("lic_bbb2", { status: "revoked", effectiveStatus: "revoked" }),
      license("lic_ccc3"),
    ];
    const { user } = renderList(rows);
    await openConfirm(user, /^Revoke$/);

    expect(screen.getByText("Will change")).toBeTruthy();
    expect(screen.getByText("Already in that state, left alone")).toBeTruthy();
  });

  it("refuses to run when nothing in the selection is eligible", async () => {
    const rows = [license("lic_aaa1", { status: "revoked", effectiveStatus: "revoked" })];
    const { user } = renderList(rows);
    await openConfirm(user, /^Revoke$/);

    expect(
      screen.getByRole("button", { name: "Revoke" }).hasAttribute("disabled"),
    ).toBe(true);
  });

  it("sends every selected id and the action", async () => {
    const { user } = renderList();
    await openConfirm(user, /^Revoke$/);
    await user.click(screen.getByRole("button", { name: "Revoke" }));

    await waitFor(() => expect(bulk.bulkLicenseAction).toHaveBeenCalled());
    const formData = bulk.bulkLicenseAction.mock.calls[0]![1] as FormData;
    expect(formData.getAll("licenseIds")).toEqual(ROWS.map((row) => row.id));
    expect(formData.get("action")).toBe("revoke");
    expect(formData.get("ownerId")).toBeNull();
  });

  it("clears the selection after a successful bulk action", async () => {
    const { user } = renderList();
    await openConfirm(user, /^Revoke$/);
    await user.click(screen.getByRole("button", { name: "Revoke" }));

    await waitFor(() =>
      expect(screen.queryByRole("region", { name: /selected licenses/i })).toBeNull(),
    );
  });

  it("reports the server's own account of what happened", async () => {
    bulk.bulkLicenseAction.mockResolvedValue(
      actionSuccess("Revoked 1 license — 2 already in that state.", {
        changed: 1,
        skipped: 2,
        notFound: 0,
      }),
    );
    const { user } = renderList();
    await openConfirm(user, /^Revoke$/);
    await user.click(screen.getByRole("button", { name: "Revoke" }));

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        "Revoked 1 license — 2 already in that state.",
      ),
    );
  });
});

describe("bulk deletion", () => {
  async function clickDelete(user: ReturnType<typeof userEvent.setup>) {
    const toolbar = screen.getByRole("region", { name: /selected licenses/i });
    await user.click(
      [...toolbar.querySelectorAll("button")].find(
        (button) => button.textContent?.trim() === "Delete",
      )!,
    );
  }

  async function openDelete(user: ReturnType<typeof userEvent.setup>) {
    await user.click(headerCheckbox());
    await clickDelete(user);
  }

  it("demands the count as well as the word", async () => {
    // Typing DELETE is muscle memory; typing the number forces a look at how
    // many are about to be erased.
    const { user } = renderList();
    await openDelete(user);

    const confirm = screen.getByRole("button", { name: "Delete permanently" });
    expect(confirm.hasAttribute("disabled")).toBe(true);

    await user.type(screen.getByLabelText(/type/i), "DELETE");
    expect(confirm.hasAttribute("disabled")).toBe(true);

    await user.type(screen.getByLabelText(/type/i), " 3");
    expect(confirm.hasAttribute("disabled")).toBe(false);
  });

  it("rejects the wrong count", async () => {
    const { user } = renderList();
    await openDelete(user);

    await user.type(screen.getByLabelText(/type/i), "DELETE 2");
    expect(
      screen.getByRole("button", { name: "Delete permanently" }).hasAttribute("disabled"),
    ).toBe(true);
  });

  it("names revoking as the reversible alternative", async () => {
    const { user } = renderList();
    await openDelete(user);
    expect(screen.getByText(/revoke them instead/i)).toBeTruthy();
  });

  it("forgets the typed phrase when cancelled", async () => {
    const { user } = renderList();
    await openDelete(user);
    await user.type(screen.getByLabelText(/type/i), "DELETE 3");
    await user.click(screen.getByRole("button", { name: /cancel/i }));

    // The selection survives the cancel — only the confirmation is discarded —
    // so the dialog is reopened without touching the checkboxes.
    await clickDelete(user);
    expect((screen.getByLabelText(/type/i) as HTMLInputElement).value).toBe("");
    expect(
      screen.getByRole("button", { name: "Delete permanently" }).hasAttribute("disabled"),
    ).toBe(true);
  });
});

describe("metadata export", () => {
  async function clickExport(user: ReturnType<typeof userEvent.setup>, label: RegExp) {
    await user.click(headerCheckbox());
    await user.click(screen.getByRole("button", { name: label }));
  }

  it("writes a CSV with no column capable of holding a key", async () => {
    const { user } = renderList();
    await clickExport(user, /export csv/i);

    await waitFor(() => expect(download.downloadTextFile).toHaveBeenCalled());
    const [filename, contents] = download.downloadTextFile.mock.calls[0]!;

    expect(filename).toMatch(/^seliware-key-licenses-.*\.csv$/);
    expect(contents).toContain("maskedKey");
    expect(contents).not.toContain("licenseKey");
    expect(contents).not.toMatch(/KEYREN-[A-Z0-9]{8}/);
  });

  it("writes JSON for the JSON button", async () => {
    const { user } = renderList();
    await clickExport(user, /export json/i);

    await waitFor(() => expect(download.downloadTextFile).toHaveBeenCalled());
    const [filename, contents] = download.downloadTextFile.mock.calls[0]!;

    expect(filename).toMatch(/\.json$/);
    const parsed = JSON.parse(contents as string) as Record<string, unknown>[];
    expect(Object.keys(parsed[0]!)).not.toContain("licenseKey");
  });

  it("sends only the selected ids", async () => {
    const { user } = renderList();
    await user.click(rowCheckbox("License lic_bbb2"));
    await user.click(screen.getByRole("button", { name: /export csv/i }));

    await waitFor(() => expect(bulk.exportSelectionAction).toHaveBeenCalled());
    const formData = bulk.exportSelectionAction.mock.calls[0]![1] as FormData;
    expect(formData.getAll("licenseIds")).toEqual(["lic_bbb2"]);
  });
});

describe("eligibilityFor", () => {
  it("counts only active licenses as revocable", () => {
    expect(
      eligibilityFor("revoke", [
        license("a"),
        license("b", { status: "revoked" }),
      ]),
    ).toEqual({ eligible: 1, ineligible: 1 });
  });

  it("counts only revoked licenses as restorable", () => {
    expect(
      eligibilityFor("restore", [license("a"), license("b", { status: "revoked" })]),
    ).toEqual({ eligible: 1, ineligible: 1 });
  });

  it("counts only locked, bound licenses as resettable", () => {
    expect(
      eligibilityFor("reset", [
        license("a", { hwidLocked: true, activation: { activatedAt: NOW, lastSeenAt: NOW } }),
        license("b", { hwidLocked: false, activation: { activatedAt: NOW, lastSeenAt: NOW } }),
        license("c", { hwidLocked: true, activation: null }),
      ]),
    ).toEqual({ eligible: 1, ineligible: 2 });
  });

  it("counts every license as deletable", () => {
    expect(
      eligibilityFor("delete", [license("a"), license("b", { status: "revoked" })]),
    ).toEqual({ eligible: 2, ineligible: 0 });
  });
});
