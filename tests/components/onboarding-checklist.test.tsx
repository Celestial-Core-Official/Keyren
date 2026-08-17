import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OnboardingChecklist } from "@/components/applications/onboarding-checklist";
import { writeUiFlag } from "@/lib/preferences";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/app/dashboard/applications/[applicationId]/licenses/actions", () => ({
  createLicenseAction: vi.fn(),
}));

const APPLICATION = "app_abc";

function renderChecklist(
  overrides: { hasLicense?: boolean; hasVerification?: boolean } = {},
) {
  render(
    <OnboardingChecklist
      applicationId={APPLICATION}
      applicationSlug="seliware-key"
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
  it("shows all three steps to a brand new application, in order", () => {
    renderChecklist();

    // The step numerals moved out of the titles and into the rail beside them,
    // so the steps are identified here by title and by their position in the
    // list rather than by a "1." the title no longer carries.
    const items = screen.getAllByRole("listitem");

    expect(items).toHaveLength(3);
    expect(items[0]?.textContent).toContain("Generate a license");
    expect(items[1]?.textContent).toContain("Copy an integration example");
    expect(items[2]?.textContent).toContain("Run one successful verification");
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
    writeUiFlag(`copied-snippet:${APPLICATION}`, true);
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
        applicationId={APPLICATION}
        applicationSlug="seliware-key"
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
    writeUiFlag(`copied-snippet:${APPLICATION}`, true);
    const { container } = render(
      <OnboardingChecklist
        applicationId={APPLICATION}
        applicationSlug="seliware-key"
        hasLicense
        hasVerification
      />,
    );

    // A permanent checklist on an application set up months ago is clutter.
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
        applicationId={APPLICATION}
        applicationSlug="seliware-key"
        hasLicense={false}
        hasVerification={false}
      />,
    );
    expect(container.textContent).toBe("");
  });

  it("keeps the dismissal per application", () => {
    writeUiFlag(`onboarding-dismissed:${APPLICATION}`, true);

    const { container } = render(
      <OnboardingChecklist
        applicationId="app_other"
        applicationSlug="other"
        hasLicense={false}
        hasVerification={false}
      />,
    );

    expect(container.textContent).not.toBe("");
  });

  it("stores only a boolean flag, never anything about the application", async () => {
    const user = renderChecklist();
    await user.click(screen.getByRole("button", { name: /dismiss getting started/i }));

    expect(localStorage.getItem(`keyren:flag:onboarding-dismissed:${APPLICATION}`)).toBe("1");
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

  it("marks a done step with a check rather than striking it out", () => {
    // Strike-through on a completed setup step reads as "cancelled", not
    // "done", and the title is still the name of something that happened.
    const { container } = render(
      <OnboardingChecklist
        applicationId={APPLICATION}
        applicationSlug="seliware-key"
        hasLicense
        hasVerification={false}
      />,
    );

    expect(container.querySelector(".line-through")).toBeNull();
  });

  it("spends no accent on tinting the card", () => {
    // The brand colour has four jobs and a fifth — the progress rail — that
    // carries meaning. Tinting a surface is none of them.
    const { container } = render(
      <OnboardingChecklist
        applicationId={APPLICATION}
        applicationSlug="seliware-key"
        hasLicense={false}
        hasVerification={false}
      />,
    );

    expect(container.innerHTML).not.toMatch(/(border|bg|shadow|ring)-primary\//);
  });

  it("is an ordered list, because the steps are in order", () => {
    const { container } = render(
      <OnboardingChecklist
        applicationId={APPLICATION}
        applicationSlug="seliware-key"
        hasLicense={false}
        hasVerification={false}
      />,
    );

    expect(container.querySelector("ol")).toBeTruthy();
  });
});
