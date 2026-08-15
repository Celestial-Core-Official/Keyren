import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OnboardingChecklist } from "@/components/products/onboarding-checklist";
import { writeUiFlag } from "@/lib/preferences";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/app/dashboard/products/[productId]/licenses/actions", () => ({
  createLicenseAction: vi.fn(),
}));

const PRODUCT = "prod_abc";

function renderChecklist(
  overrides: { hasLicense?: boolean; hasVerification?: boolean } = {},
) {
  render(
    <OnboardingChecklist
      productId={PRODUCT}
      productSlug="seliware-key"
      hasLicense={overrides.hasLicense ?? false}
      hasVerification={overrides.hasVerification ?? false}
    />,
  );
  return userEvent.setup();
}

beforeEach(() => {
  localStorage.clear();
});

describe("OnboardingChecklist — progress", () => {
  it("shows all three steps to a brand new product", () => {
    renderChecklist();

    expect(screen.getByText(/1\. Generate a license/)).toBeTruthy();
    expect(screen.getByText(/2\. Copy an integration example/)).toBeTruthy();
    expect(screen.getByText(/3\. Run one successful verification/)).toBeTruthy();
    expect(screen.getByText(/0 of 3 done/)).toBeTruthy();
  });

  it("derives the first step from whether a license exists", () => {
    renderChecklist({ hasLicense: true });
    expect(screen.getByText(/1 of 3 done/)).toBeTruthy();
  });

  it("derives the third step from a real verification having happened", () => {
    // An activation row is only ever written by a successful verification, so
    // nothing has to be marked complete by hand.
    renderChecklist({ hasLicense: true, hasVerification: true });
    expect(screen.getByText(/2 of 3 done/)).toBeTruthy();
  });

  it("reads the copied-snippet step from the stored flag", () => {
    writeUiFlag(`copied-snippet:${PRODUCT}`, true);
    renderChecklist();

    expect(screen.getByText(/1 of 3 done/)).toBeTruthy();
  });

  it("names the next step so there is one obvious thing to do", () => {
    renderChecklist({ hasLicense: true });
    expect(screen.getByText(/next up, copy an integration example/i)).toBeTruthy();
  });

  it("offers an action on the next step only", () => {
    // Three buttons at once is three decisions; one is a next step.
    const { container } = render(
      <OnboardingChecklist
        productId={PRODUCT}
        productSlug="seliware-key"
        hasLicense={false}
        hasVerification={false}
      />,
    );

    const actions = container.querySelectorAll("ol a, ol button");
    expect(actions).toHaveLength(1);
  });
});

describe("OnboardingChecklist — disappearing", () => {
  it("is gone once every step is done", () => {
    writeUiFlag(`copied-snippet:${PRODUCT}`, true);
    const { container } = render(
      <OnboardingChecklist
        productId={PRODUCT}
        productSlug="seliware-key"
        hasLicense
        hasVerification
      />,
    );

    // A permanent checklist on a product set up months ago is clutter.
    expect(container.textContent).toBe("");
  });

  it("can be dismissed before it is complete", async () => {
    const user = renderChecklist();
    await user.click(screen.getByRole("button", { name: /dismiss getting started/i }));

    expect(screen.queryByText(/getting started/i)).toBeNull();
  });

  it("stays dismissed across a remount", async () => {
    const user = renderChecklist();
    await user.click(screen.getByRole("button", { name: /dismiss getting started/i }));

    const { container } = render(
      <OnboardingChecklist
        productId={PRODUCT}
        productSlug="seliware-key"
        hasLicense={false}
        hasVerification={false}
      />,
    );
    expect(container.textContent).toBe("");
  });

  it("keeps the dismissal per product", () => {
    writeUiFlag(`onboarding-dismissed:${PRODUCT}`, true);

    const { container } = render(
      <OnboardingChecklist
        productId="prod_other"
        productSlug="other"
        hasLicense={false}
        hasVerification={false}
      />,
    );

    expect(container.textContent).not.toBe("");
  });

  it("stores only a boolean flag, never anything about the product", async () => {
    const user = renderChecklist();
    await user.click(screen.getByRole("button", { name: /dismiss getting started/i }));

    expect(localStorage.getItem(`keyren:flag:onboarding-dismissed:${PRODUCT}`)).toBe("1");
    expect(JSON.stringify(localStorage)).not.toContain("KEYREN-");
  });
});

describe("OnboardingChecklist — accessibility", () => {
  it("states completion in text, not only with a colour", () => {
    renderChecklist({ hasLicense: true });

    // Testing Library trims the trailing space these labels carry for speech.
    expect(screen.getByText("Completed:")).toBeTruthy();
    expect(screen.getAllByText("Not yet done:").length).toBeGreaterThan(0);
  });

  it("is an ordered list, because the steps are in order", () => {
    const { container } = render(
      <OnboardingChecklist
        productId={PRODUCT}
        productSlug="seliware-key"
        hasLicense={false}
        hasVerification={false}
      />,
    );

    expect(container.querySelector("ol")).toBeTruthy();
  });
});
