import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CopyButton } from "@/components/dashboard/copy-button";

const toast = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock("sonner", () => ({ toast }));

/**
 * `userEvent.setup()` installs its own `navigator.clipboard` stub, so the
 * order matters: set up the user first, then override the clipboard, or the
 * override is silently replaced and every denial test quietly succeeds.
 */
function setupWithClipboard(writeText: (() => Promise<void>) | null) {
  const user = userEvent.setup();

  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: writeText === null ? undefined : { writeText: vi.fn(writeText) },
  });

  return user;
}

const resolves = async () => undefined;
const rejects = async () => {
  throw new Error("NotAllowedError");
};

beforeEach(() => {
  toast.success.mockClear();
  toast.error.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("CopyButton — success", () => {
  it("writes the value to the clipboard", async () => {
    const user = setupWithClipboard(resolves);

    render(<CopyButton value="KEYREN-TEST" label="Copy key" />);
    await user.click(screen.getByRole("button", { name: "Copy key" }));

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("KEYREN-TEST");
  });

  it("confirms in the button itself", async () => {
    const user = setupWithClipboard(resolves);

    render(<CopyButton value="KEYREN-TEST" label="Copy key" />);
    await user.click(screen.getByRole("button", { name: "Copy key" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /copied/i })).toBeTruthy();
    });
  });

  it("announces the result to assistive technology", async () => {
    const user = setupWithClipboard(resolves);

    render(<CopyButton value="KEYREN-TEST" label="Copy key" />);
    await user.click(screen.getByRole("button", { name: "Copy key" }));

    await waitFor(() => {
      const live = document.querySelector("[aria-live]");
      expect(live?.textContent).toMatch(/copied/i);
    });
  });

  it("raises a toast when asked to announce loudly", async () => {
    const user = setupWithClipboard(resolves);

    render(<CopyButton value="KEYREN-TEST" label="Copy all" announce />);
    await user.click(screen.getByRole("button", { name: "Copy all" }));

    await waitFor(() => expect(toast.success).toHaveBeenCalled());
  });
});

describe("CopyButton — clipboard denial", () => {
  it("does not silently swallow a rejection", async () => {
    // Alpha_v1 caught this and did nothing, so a developer in a context where
    // the clipboard is blocked clicked Copy, saw no change, and had no idea
    // their only chance to save the key had just been wasted.
    const user = setupWithClipboard(rejects);

    render(<CopyButton value="KEYREN-TEST" label="Copy key" />);
    await user.click(screen.getByRole("button", { name: "Copy key" }));

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
  });

  it("tells the developer to select the text manually", async () => {
    const user = setupWithClipboard(rejects);

    render(<CopyButton value="KEYREN-TEST" label="Copy key" />);
    await user.click(screen.getByRole("button", { name: "Copy key" }));

    await waitFor(() => {
      const message = toast.error.mock.calls[0]?.[0] as string;
      expect(message).toMatch(/select/i);
    });
  });

  it("survives a browser with no clipboard API at all", async () => {
    const user = setupWithClipboard(null);

    render(<CopyButton value="KEYREN-TEST" label="Copy key" />);
    await user.click(screen.getByRole("button", { name: "Copy key" }));

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    // And never reports success it did not achieve.
    expect(screen.queryByRole("button", { name: /copied/i })).toBeNull();
  });

  it("does not report success when the write rejects", async () => {
    const user = setupWithClipboard(rejects);

    render(<CopyButton value="KEYREN-TEST" label="Copy key" />);
    await user.click(screen.getByRole("button", { name: "Copy key" }));

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: /copied/i })).toBeNull();
    expect(toast.success).not.toHaveBeenCalled();
  });
});

describe("CopyButton — accessibility", () => {
  it("has an accessible name even when rendered icon-only", () => {
    setupWithClipboard(resolves);
    render(<CopyButton value="app_abc" label="" />);

    expect(screen.getByRole("button", { name: /copy/i })).toBeTruthy();
  });

  it("is a real button, so it is keyboard reachable", () => {
    setupWithClipboard(resolves);
    render(<CopyButton value="app_abc" label="Copy application ID" />);

    const button = screen.getByRole("button", { name: "Copy application ID" });
    expect(button.tagName).toBe("BUTTON");
    expect(button.getAttribute("type")).toBe("button");
  });
});
