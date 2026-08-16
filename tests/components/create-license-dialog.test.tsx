import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CreateLicenseDialog } from "@/components/licenses/create-license-dialog";
import { actionFailure, actionSuccess } from "@/lib/actions/state";
import type { CreatedLicense } from "@/lib/licenses/batch";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

const SECRET_KEY = "KEYREN-SECRET11-SECRET22-SECRET33-ZZZZ";

const action = vi.hoisted(() => ({ createLicenseAction: vi.fn() }));
vi.mock("@/app/dashboard/applications/[applicationId]/licenses/actions", () => ({
  createLicenseAction: action.createLicenseAction,
}));

function madeLicense(): CreatedLicense {
  return {
    id: "lic_1",
    label: "Acme Corp",
    licenseKey: SECRET_KEY,
    keyLast4: "ZZZZ",
    applicationId: "app_abc",
    expiresAt: null,
    hwidLocked: true,
    createdAt: new Date("2026-08-15T09:30:00.000Z"),
  };
}

beforeEach(() => {
  toast.success.mockClear();
  toast.error.mockClear();
  action.createLicenseAction.mockReset();
  action.createLicenseAction.mockResolvedValue(
    actionSuccess("License generated. Save the key before closing.", {
      licenses: [madeLicense()],
    }),
  );
  localStorage.clear();
});

function renderDialog() {
  render(<CreateLicenseDialog applicationId="app_abc" applicationSlug="seliware-key" />);
  return userEvent.setup();
}

async function generate(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /generate license/i }));
  await user.click(screen.getByRole("button", { name: /^generate license$/i }));
  await screen.findByText(SECRET_KEY);
}

describe("CreateLicenseDialog — generating", () => {
  it("opens the form, not the result", async () => {
    const user = renderDialog();
    await user.click(screen.getByRole("button", { name: /generate license/i }));

    expect(screen.getByLabelText(/how many/i)).toBeTruthy();
    expect(screen.queryByText(SECRET_KEY)).toBeNull();
  });

  it("shows the key once the action succeeds", async () => {
    const user = renderDialog();
    await generate(user);

    expect(screen.getByText(SECRET_KEY)).toBeTruthy();
  });

  it("sends the application id with the submission", async () => {
    const user = renderDialog();
    await generate(user);

    const formData = action.createLicenseAction.mock.calls[0]![1] as FormData;
    expect(formData.get("applicationId")).toBe("app_abc");
    expect(formData.get("mode")).toBe("permanent");
  });
});

describe("CreateLicenseDialog — the key cannot come back", () => {
  it("removes the key from the document once acknowledged", async () => {
    // The load-bearing test of the whole release. `useActionState` has no
    // reset, so without remounting the component that owns it, the plaintext
    // would sit in React state for the life of the page and the dialog could
    // be coaxed into showing it again.
    const user = renderDialog();
    await generate(user);

    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Done" }));

    await waitFor(() => expect(screen.queryByText(SECRET_KEY)).toBeNull());
    expect(document.body.textContent).not.toContain(SECRET_KEY);
  });

  it("shows the empty form again rather than the previous key", async () => {
    const user = renderDialog();
    await generate(user);

    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Done" }));
    await waitFor(() => expect(screen.queryByText(SECRET_KEY)).toBeNull());

    await user.click(screen.getByRole("button", { name: /generate license/i }));

    expect(screen.getByLabelText(/how many/i)).toBeTruthy();
    expect(screen.queryByText(SECRET_KEY)).toBeNull();
  });

  it("returns to a blank form after Generate another", async () => {
    const user = renderDialog();
    await generate(user);

    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: /generate another/i }));

    await waitFor(() => expect(screen.queryByText(SECRET_KEY)).toBeNull());
    expect(screen.getByLabelText(/how many/i)).toBeTruthy();
  });

  it("never writes a key to local storage", async () => {
    const user = renderDialog();
    await generate(user);

    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Done" }));

    expect(JSON.stringify(localStorage)).not.toContain("KEYREN");
    expect(JSON.stringify(localStorage)).not.toContain("SECRET");
  });
});

describe("CreateLicenseDialog — remembered preferences", () => {
  it("remembers the settings used, but never the label or notes", async () => {
    const user = renderDialog();

    await user.click(screen.getByRole("button", { name: /generate license/i }));
    await user.clear(screen.getByLabelText(/how many/i));
    await user.type(screen.getByLabelText(/how many/i), "5");
    await user.type(screen.getByLabelText(/^label/i), "Acme Corp");
    await user.click(screen.getByRole("button", { name: /^generate 5 licenses$/i }));

    await screen.findByText(SECRET_KEY);

    const stored = JSON.parse(
      localStorage.getItem("keyren:license-prefs:app_abc")!,
    ) as Record<string, unknown>;

    expect(stored.quantity).toBe(5);
    expect(Object.keys(stored).sort()).toEqual([
      "duration",
      "hwidLocked",
      "mode",
      "quantity",
    ]);
    expect(JSON.stringify(localStorage)).not.toContain("Acme");
  });

  it("does not rewrite defaults when the developer cancels", async () => {
    const user = renderDialog();

    await user.click(screen.getByRole("button", { name: /generate license/i }));
    await user.clear(screen.getByLabelText(/how many/i));
    await user.type(screen.getByLabelText(/how many/i), "9");
    await user.click(screen.getByRole("button", { name: /cancel/i }));

    expect(JSON.stringify(localStorage)).not.toContain('"quantity":9');
  });
});

describe("CreateLicenseDialog — failure", () => {
  it("keeps the form open and marks the offending field", async () => {
    action.createLicenseAction.mockResolvedValue(
      actionFailure("Expiration date must be in the future.", {
        expiresAt: "Expiration date must be in the future.",
      }),
    );

    const user = renderDialog();
    await user.click(screen.getByRole("button", { name: /generate license/i }));
    await user.click(screen.getByRole("button", { name: /^generate license$/i }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Expiration date must be in the future."),
    );
    expect(screen.getByLabelText(/how many/i)).toBeTruthy();
  });
});
