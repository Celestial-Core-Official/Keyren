import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToStaticMarkup } from "react-dom/server";
import { ApplicationStatusSetting } from "@/components/applications/application-status-setting";
import { actionSuccess } from "@/lib/actions/state";

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

describe("ApplicationStatusSetting — the markup", () => {
  /**
   * The regression guard for the defect this component was rebuilt for.
   *
   * Radix's Switch root is a <button>. Wrapping it in a submit <Button> nested
   * one button inside another, and a browser's parser resolves that by closing
   * the outer one and ejecting the switch as a sibling — so the server-rendered
   * row arrived with an empty zero-sized button beside an unclickable switch,
   * and React then hydrated a tree that did not match.
   *
   * Asserted against the server markup rather than the rendered DOM, because
   * the client tree was never the broken one: appendChild has no such parser
   * rule and nests the two happily. A test that renders and clicks cannot see
   * this.
   */
  it("server-renders no button inside a button", () => {
    const html = renderToStaticMarkup(
      <ApplicationStatusSetting applicationId="app_ABC123" name="Acme" disabled={false} />,
    );

    const tokens = [...html.matchAll(/<button\b|<\/button>/g)].map((match) => match[0]);
    let depth = 0;
    for (const token of tokens) {
      if (token === "</button>") {
        depth -= 1;
        continue;
      }
      depth += 1;
      expect(depth).toBeLessThanOrEqual(1);
    }
    expect(depth).toBe(0);
  });

  it("keeps the switch reachable by keyboard", () => {
    // It used to carry tabIndex={-1} because a Button owned the interaction.
    render(<ApplicationStatusSetting applicationId="app_ABC123" name="Acme" disabled={false} />);
    expect(screen.getByRole("switch").getAttribute("tabindex")).not.toBe("-1");
  });
});

describe("ApplicationStatusSetting — turning it off", () => {
  it("asks before disabling rather than acting on the click", async () => {
    const user = userEvent.setup();
    render(<ApplicationStatusSetting applicationId="app_ABC123" name="Acme" disabled={false} />);

    await user.click(screen.getByRole("switch"));

    expect(await screen.findByText(/Disable Acme\?/)).toBeTruthy();
    expect(actions.setApplicationDisabledAction).not.toHaveBeenCalled();
  });

  it("submits the application and the intended end state once confirmed", async () => {
    const user = userEvent.setup();
    render(<ApplicationStatusSetting applicationId="app_ABC123" name="Acme" disabled={false} />);

    await user.click(screen.getByRole("switch"));
    await user.click(await screen.findByRole("button", { name: "Disable application" }));

    await waitFor(() => expect(actions.setApplicationDisabledAction).toHaveBeenCalled());
    const formData = actions.setApplicationDisabledAction.mock.calls[0]![1] as FormData;
    expect(formData.get("applicationId")).toBe("app_ABC123");
    expect(formData.get("disabled")).toBe("true");
    expect(formData.get("ownerId")).toBeNull();
  });

  it("does nothing at all when the confirmation is dismissed", async () => {
    const user = userEvent.setup();
    render(<ApplicationStatusSetting applicationId="app_ABC123" name="Acme" disabled={false} />);

    await user.click(screen.getByRole("switch"));
    await user.click(await screen.findByRole("button", { name: "Cancel" }));

    expect(actions.setApplicationDisabledAction).not.toHaveBeenCalled();
  });
});

describe("ApplicationStatusSetting — turning it back on", () => {
  it("restores service on the click, with nothing to confirm", async () => {
    const user = userEvent.setup();
    render(<ApplicationStatusSetting applicationId="app_ABC123" name="Acme" disabled />);

    await user.click(screen.getByRole("switch"));

    await waitFor(() => expect(actions.setApplicationDisabledAction).toHaveBeenCalled());
    const formData = actions.setApplicationDisabledAction.mock.calls[0]![1] as FormData;
    expect(formData.get("applicationId")).toBe("app_ABC123");
    expect(formData.get("disabled")).toBe("false");
  });

  it("reports the result rather than staying silent", async () => {
    actions.setApplicationDisabledAction.mockResolvedValue(
      actionSuccess("Application enabled. License checks will succeed again.", null),
    );
    const user = userEvent.setup();
    render(<ApplicationStatusSetting applicationId="app_ABC123" name="Acme" disabled />);

    await user.click(screen.getByRole("switch"));

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        "Application enabled. License checks will succeed again.",
      ),
    );
  });
});
