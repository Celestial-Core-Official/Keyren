import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { useActionFeedback, FieldError, SubmitButton } from "@/components/dashboard/feedback";
import {
  actionFailure,
  actionSuccess,
  idleAction,
  type ActionState,
} from "@/lib/actions/state";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

beforeEach(() => {
  toast.success.mockClear();
  toast.error.mockClear();
});

function Harness({ state }: { state: ActionState<{ id: string } | null> }) {
  useActionFeedback(state);
  return <p>harness</p>;
}

describe("useActionFeedback", () => {
  it("says nothing while idle", () => {
    render(<Harness state={idleAction()} />);

    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("raises a success toast carrying the action's own message", () => {
    render(<Harness state={actionSuccess("Revoked Acme Corp.", null)} />);

    expect(toast.success).toHaveBeenCalledWith("Revoked Acme Corp.");
  });

  it("raises an error toast carrying the action's own message", () => {
    render(<Harness state={actionFailure("License not found.")} />);

    expect(toast.error).toHaveBeenCalledWith("License not found.");
  });

  it("does not re-announce the same result on an unrelated re-render", () => {
    // `useActionState` keeps its last value for the life of the component, so
    // without a guard every render would re-fire the previous toast.
    const state = actionSuccess("Revoked.", null);
    const { rerender } = render(<Harness state={state} />);

    rerender(<Harness state={state} />);
    rerender(<Harness state={state} />);

    expect(toast.success).toHaveBeenCalledTimes(1);
  });

  it("announces two identical results separately", () => {
    // Revoking two licenses in a row produces the same sentence twice, and
    // both deserve confirmation.
    const { rerender } = render(<Harness state={actionSuccess("Revoked.", null)} />);
    rerender(<Harness state={actionSuccess("Revoked.", null)} />);

    expect(toast.success).toHaveBeenCalledTimes(2);
  });

  it("announces a failure that follows a success", () => {
    const { rerender } = render(<Harness state={actionSuccess("Done.", null)} />);
    rerender(<Harness state={actionFailure("Nope.")} />);

    expect(toast.success).toHaveBeenCalledTimes(1);
    expect(toast.error).toHaveBeenCalledTimes(1);
  });

  it("hands the result payload to onSuccess", () => {
    const onSuccess = vi.fn();

    function WithHandler() {
      useActionFeedback(actionSuccess("Done.", { id: "lic_9" }), { onSuccess });
      return null;
    }

    render(<WithHandler />);
    expect(onSuccess).toHaveBeenCalledWith({ id: "lic_9" });
  });

  it("calls onError only for failures", () => {
    const onError = vi.fn();

    function WithHandler({ state }: { state: ActionState<null> }) {
      useActionFeedback(state, { onError });
      return null;
    }

    const { rerender } = render(<WithHandler state={actionSuccess("Done.", null)} />);
    expect(onError).not.toHaveBeenCalled();

    rerender(<WithHandler state={actionFailure("Nope.")} />);
    expect(onError).toHaveBeenCalledTimes(1);
  });
});

describe("SubmitButton", () => {
  it("submits the enclosing form", () => {
    render(
      <form>
        <SubmitButton>Generate license</SubmitButton>
      </form>,
    );

    const button = screen.getByRole("button", { name: /generate license/i });
    expect(button.getAttribute("type")).toBe("submit");
  });

  it("respects an explicit disabled state", () => {
    render(
      <form>
        <SubmitButton disabled>Delete permanently</SubmitButton>
      </form>,
    );

    expect(screen.getByRole("button").hasAttribute("disabled")).toBe(true);
  });

  it("renders both labels so the width cannot shift when it becomes busy", () => {
    // Both occupy the same grid cell; the button is sized to the wider one.
    render(
      <form>
        <SubmitButton pendingLabel="Generating…">Generate license</SubmitButton>
      </form>,
    );

    const button = screen.getByRole("button");
    expect(button.textContent).toContain("Generate license");
    expect(button.textContent).toContain("Generating…");
  });

  it("is not busy before submission", () => {
    render(
      <form>
        <SubmitButton>Save</SubmitButton>
      </form>,
    );

    expect(screen.getByRole("button").getAttribute("aria-busy")).toBe("false");
  });
});

describe("FieldError", () => {
  it("renders nothing when there is no error", () => {
    const { container } = render(<FieldError id="label-error" />);
    expect(container.textContent).toBe("");
  });

  it("exposes the message under the id an input can point at", () => {
    render(<FieldError id="label-error">Label is too long</FieldError>);

    const node = document.getElementById("label-error");
    expect(node?.textContent).toBe("Label is too long");
  });
});
