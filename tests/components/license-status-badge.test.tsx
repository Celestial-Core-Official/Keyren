import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { LicenseStatusBadge } from "@/components/licenses/license-status-badge";

const HOUR = 60 * 60 * 1000;

describe("LicenseStatusBadge", () => {
  it("renders Revoked for a revoked license regardless of expiry", () => {
    render(
      <LicenseStatusBadge status="revoked" expiresAt={new Date(Date.now() + HOUR)} />,
    );

    expect(screen.getByText("Revoked")).toBeTruthy();
  });

  it("renders Expired for an active license past its deadline", () => {
    render(
      <LicenseStatusBadge status="active" expiresAt={new Date(Date.now() - HOUR)} />,
    );

    expect(screen.getByText("Expired")).toBeTruthy();
  });

  it("renders Active for a permanent license", () => {
    render(<LicenseStatusBadge status="active" expiresAt={null} />);

    expect(screen.getByText("Active")).toBeTruthy();
  });

  it("renders Active for a license expiring in the future", () => {
    render(
      <LicenseStatusBadge status="active" expiresAt={new Date(Date.now() + HOUR)} />,
    );

    expect(screen.getByText("Active")).toBeTruthy();
  });

  it("carries no Tailwind palette literals, which are blind to the theme", () => {
    // Through Alpha_v2 this component hardcoded `text-emerald-400` and
    // `text-amber-400` for BOTH themes — leftovers from when <html> was pinned
    // dark. Against the light palette those sit near 2:1, far under AA. The
    // colours now come from semantic tokens, and this is the tripwire that
    // keeps a literal from creeping back in.
    const { container } = render(<LicenseStatusBadge status="active" expiresAt={null} />);

    expect(container.innerHTML).not.toMatch(/emerald|amber|-400\b/);
  });

  it("names every state in text, so colour is never the only signal", () => {
    const { container } = render(
      <LicenseStatusBadge status="active" expiresAt={new Date(Date.now() - HOUR)} />,
    );

    // The dot is decorative and must be hidden from assistive technology; the
    // label is what actually carries the state.
    expect(container.querySelector("[aria-hidden='true']")).toBeTruthy();
    expect(screen.getByText("Expired")).toBeTruthy();
  });
});
