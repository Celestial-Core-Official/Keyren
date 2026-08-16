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
});
