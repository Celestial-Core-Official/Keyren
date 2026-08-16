import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { LicenseTable } from "@/components/licenses/license-table";
import { LicenseCardList } from "@/components/licenses/license-card-list";
import { primaryActionFor, canResetActivation } from "@/components/licenses/license-row-actions";
import type { LicenseListItem } from "@/lib/licenses/types";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/app/dashboard/applications/[applicationId]/licenses/actions", () => ({
  revokeLicenseAction: vi.fn(),
  restoreLicenseAction: vi.fn(),
  resetActivationAction: vi.fn(),
  deleteLicenseAction: vi.fn(),
  updateLicenseDetailsAction: vi.fn(),
}));

const NOW = new Date("2026-08-15T12:00:00.000Z");

function license(overrides: Partial<LicenseListItem> = {}): LicenseListItem {
  return {
    id: "lic_1",
    applicationId: "app_abc",
    keyLast4: "WXYZ",
    label: "Acme Corp",
    notes: null,
    status: "active",
    effectiveStatus: "active",
    expiresAt: null,
    hwidLocked: true,
    createdAt: new Date(NOW.getTime() - 86_400_000),
    updatedAt: NOW,
    revokedAt: null,
    activation: null,
    ...overrides,
  };
}

describe("LicenseTable — identity", () => {
  it("shows the label as the primary line and the masked key beneath", () => {
    render(<LicenseTable licenses={[license()]} applicationId="app_abc" />);

    expect(screen.getByText("Acme Corp")).toBeTruthy();
    expect(screen.getByText("KEYREN-••••-••••-••••-WXYZ")).toBeTruthy();
  });

  it("falls back to 'Unlabeled license' rather than a blank cell", () => {
    render(<LicenseTable licenses={[license({ label: null })]} applicationId="app_abc" />);

    expect(screen.getByText("Unlabeled license")).toBeTruthy();
  });

  it("never renders anything resembling a full key", () => {
    render(<LicenseTable licenses={[license()]} applicationId="app_abc" />);

    // Four characters is all that was ever stored; a run of eight would mean
    // a key had leaked into the list.
    expect(document.body.textContent).not.toMatch(/[A-HJ-NP-TV-Z0-9]{8}/);
  });

  it("shows notes when present", () => {
    render(
      <LicenseTable licenses={[license({ notes: "Chargeback risk" })]} applicationId="app_abc" />,
    );

    expect(screen.getByText("Chargeback risk")).toBeTruthy();
  });
});

describe("LicenseTable — status", () => {
  it("shows Expired for a license whose effective status is expired", () => {
    render(
      <LicenseTable
        licenses={[
          license({
            effectiveStatus: "expired",
            expiresAt: new Date(NOW.getTime() - 86_400_000),
          }),
        ]}
        applicationId="app_abc"
      />,
    );

    expect(screen.getByText("Expired")).toBeTruthy();
    expect(screen.queryByText("Active")).toBeNull();
  });

  it("shows Revoked ahead of an expiry that has also passed", () => {
    render(
      <LicenseTable
        licenses={[
          license({
            status: "revoked",
            effectiveStatus: "revoked",
            expiresAt: new Date(NOW.getTime() - 86_400_000),
          }),
        ]}
        applicationId="app_abc"
      />,
    );

    expect(screen.getByText("Revoked")).toBeTruthy();
  });

  it("says Never rather than an empty cell for a permanent license", () => {
    render(<LicenseTable licenses={[license()]} applicationId="app_abc" />);
    expect(screen.getByText("Never")).toBeTruthy();
  });
});

describe("LicenseTable — dates", () => {
  it("renders a relative label with the exact UTC instant behind it", () => {
    render(<LicenseTable licenses={[license()]} applicationId="app_abc" />);

    const created = screen.getByText("1 day ago");
    expect(created.tagName).toBe("TIME");
    expect(created.getAttribute("title")).toMatch(/UTC$/);
    expect(created.getAttribute("dateTime")).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("shows an expiry as a calendar day in UTC", () => {
    render(
      <LicenseTable
        licenses={[license({ expiresAt: new Date("2026-12-31T23:59:59.999Z") })]}
        applicationId="app_abc"
      />,
    );

    // Formatting in the viewer's timezone would show Jan 1 east of UTC, which
    // disagrees with what the API will actually enforce.
    expect(screen.getByText("Dec 31, 2026")).toBeTruthy();
  });
});

describe("row action eligibility", () => {
  it("offers Reset for a locked, bound license", () => {
    const bound = license({
      hwidLocked: true,
      activation: { activatedAt: NOW, lastSeenAt: NOW },
    });

    expect(primaryActionFor(bound)).toBe("reset");
    expect(canResetActivation(bound)).toBe(true);
  });

  it("never offers Reset for an unlocked license, bound or not", () => {
    // An unlocked license's activation row records recent activity, not an
    // exclusive claim — there is nothing to release, and offering to release
    // it implies a binding that does not exist.
    const unlocked = license({
      hwidLocked: false,
      activation: { activatedAt: NOW, lastSeenAt: NOW },
    });

    expect(canResetActivation(unlocked)).toBe(false);
    expect(primaryActionFor(unlocked)).toBe("revoke");
  });

  it("does not offer Reset for a locked license nothing has claimed", () => {
    expect(canResetActivation(license({ hwidLocked: true, activation: null }))).toBe(false);
  });

  it("offers Restore for a revoked license whatever else is true of it", () => {
    expect(
      primaryActionFor(
        license({
          status: "revoked",
          hwidLocked: true,
          activation: { activatedAt: NOW, lastSeenAt: NOW },
        }),
      ),
    ).toBe("restore");
  });

  it("hides Reset activation from the menu when it does not apply", () => {
    render(
      <LicenseTable
        licenses={[license({ hwidLocked: false, activation: { activatedAt: NOW, lastSeenAt: NOW } })]}
        applicationId="app_abc"
      />,
    );

    expect(screen.queryByText("Reset activation")).toBeNull();
  });
});

describe("LicenseCardList", () => {
  it("keeps the row actions inside the card flow on narrow screens", () => {
    // On a phone the table's action column sits off the right edge, reachable
    // only by horizontal scrolling that fights the page's own scroll.
    const { container } = render(
      <LicenseCardList licenses={[license()]} applicationId="app_abc" />,
    );

    const card = container.querySelector("li")!;
    expect(within(card).getByRole("button", { name: /more actions/i })).toBeTruthy();
  });

  it("leads with the label, status and expiry", () => {
    render(
      <LicenseCardList
        licenses={[license({ expiresAt: new Date("2026-12-31T23:59:59.999Z") })]}
        applicationId="app_abc"
      />,
    );

    expect(screen.getByText("Acme Corp")).toBeTruthy();
    expect(screen.getByText("Active")).toBeTruthy();
    expect(screen.getByText("Dec 31, 2026")).toBeTruthy();
  });

  it("is hidden at desktop widths, where the table takes over", () => {
    const { container } = render(
      <LicenseCardList licenses={[license()]} applicationId="app_abc" />,
    );

    expect(container.querySelector("ul")?.className).toContain("md:hidden");
  });
});
