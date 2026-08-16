import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { renderToString } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";
import { ApiTester } from "@/components/applications/api-tester";
import { OnboardingChecklist } from "@/components/applications/onboarding-checklist";
import { writeUiFlag } from "@/lib/preferences";

const APPLICATION = "app_HYDRATION";

/**
 * Server-renders a tree with no browser storage in reach — the way Node
 * actually renders it — then hydrates the result in the DOM and reports every
 * recoverable error React raised.
 *
 * A hydration mismatch is not a cosmetic warning. React discards the server
 * HTML for the whole root and re-renders it on the client, which is how a
 * mismatch in one component surfaces as an unrelated component misbehaving
 * elsewhere on the page.
 */
async function hydrationErrorsFor(ui: React.ReactElement): Promise<string[]> {
  // Wrapped in an element, because a page renders these inside its own markup
  // and React treats the root container differently: leftover children of the
  // container itself are left alone, which would hide the very mismatch this
  // helper is looking for.
  const tree = <div>{ui}</div>;

  const storage = globalThis.localStorage;

  // The server has no localStorage. Anything a component reads from it during
  // render is therefore absent server-side and present client-side, which is
  // the mismatch this helper exists to catch.
  Reflect.deleteProperty(globalThis, "localStorage");
  let html: string;
  try {
    html = renderToString(tree);
  } finally {
    Object.defineProperty(globalThis, "localStorage", {
      value: storage,
      configurable: true,
      writable: true,
    });
  }

  const container = document.createElement("div");
  container.innerHTML = html;
  document.body.append(container);

  const errors: string[] = [];
  await act(async () => {
    hydrateRoot(container, tree, {
      onRecoverableError: (error) => {
        errors.push(error instanceof Error ? error.message : String(error));
      },
    });
  });

  return errors;
}

describe("hydration", () => {
  beforeEach(() => {
    globalThis.localStorage?.clear();
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("the API tester hydrates without a mismatch", async () => {
    const errors = await hydrationErrorsFor(<ApiTester applicationId={APPLICATION} />);

    expect(errors).toEqual([]);
  });

  it("the onboarding checklist hydrates without a mismatch once dismissed", async () => {
    writeUiFlag(`onboarding-dismissed:${APPLICATION}`, true);

    const errors = await hydrationErrorsFor(
      <OnboardingChecklist
        applicationId={APPLICATION}
        applicationSlug="hydration"
        hasLicense={false}
        hasVerification={false}
      />,
    );

    expect(errors).toEqual([]);
  });

  it("the onboarding checklist hydrates without a mismatch once a snippet is copied", async () => {
    writeUiFlag(`copied-snippet:${APPLICATION}`, true);

    const errors = await hydrationErrorsFor(
      <OnboardingChecklist
        applicationId={APPLICATION}
        applicationSlug="hydration"
        hasLicense={false}
        hasVerification={false}
      />,
    );

    expect(errors).toEqual([]);
  });
});
