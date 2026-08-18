import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  KeyboardShortcuts,
  isTypingInFormField,
} from "@/components/dashboard/keyboard-shortcuts";

function Page({ onCreate = vi.fn() }: { onCreate?: () => void } = {}) {
  return (
    <>
      <KeyboardShortcuts />
      <input data-keyren-search="true" aria-label="Search licenses" defaultValue="acme" />
      <textarea aria-label="Notes" />
      <button data-keyren-create="license" onClick={onCreate}>
        Generate license
      </button>
    </>
  );
}

let user: ReturnType<typeof userEvent.setup>;

beforeEach(() => {
  user = userEvent.setup();
  document.body.innerHTML = "";
});

describe("the / shortcut", () => {
  it("focuses the page's search box", async () => {
    render(<Page />);
    await user.keyboard("/");

    expect(document.activeElement).toBe(screen.getByLabelText("Search licenses"));
  });

  it("selects the existing term so typing replaces it", async () => {
    render(<Page />);
    await user.keyboard("/");

    const input = screen.getByLabelText("Search licenses") as HTMLInputElement;
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe("acme".length);
  });

  it("does nothing on a page with no search box", async () => {
    render(<KeyboardShortcuts />);
    await user.keyboard("/");

    expect(document.activeElement).toBe(document.body);
  });
});

describe("the N shortcut", () => {
  it("opens the page's create dialog", async () => {
    const onCreate = vi.fn();
    render(<Page onCreate={onCreate} />);

    await user.keyboard("n");
    expect(onCreate).toHaveBeenCalledTimes(1);
  });

  it("works with the shift key producing a capital", async () => {
    const onCreate = vi.fn();
    render(<Page onCreate={onCreate} />);

    await user.keyboard("N");
    expect(onCreate).toHaveBeenCalledTimes(1);
  });

  it("does nothing on a page with no create button", async () => {
    render(<KeyboardShortcuts />);
    await user.keyboard("n");
    // Nothing to assert but the absence of a crash: this is the guard that
    // keeps the shortcut from throwing on Settings.
    expect(document.activeElement).toBe(document.body);
  });
});

describe("shortcuts never steal a keystroke", () => {
  it("stays out of the way while typing in a text input", async () => {
    const onCreate = vi.fn();
    render(<Page onCreate={onCreate} />);

    const search = screen.getByLabelText("Search licenses") as HTMLInputElement;
    search.focus();
    search.setSelectionRange(4, 4);
    await user.keyboard("n");

    expect(onCreate).not.toHaveBeenCalled();
    expect(search.value).toBe("acmen");
  });

  it("stays out of the way while typing in a textarea", async () => {
    const onCreate = vi.fn();
    render(<Page onCreate={onCreate} />);

    const notes = screen.getByLabelText("Notes") as HTMLTextAreaElement;
    notes.focus();
    await user.keyboard("n/n");

    expect(onCreate).not.toHaveBeenCalled();
    expect(notes.value).toBe("n/n");
  });

  it("leaves a slash typed into a search box alone", async () => {
    render(<Page />);

    const search = screen.getByLabelText("Search licenses") as HTMLInputElement;
    search.focus();
    search.setSelectionRange(4, 4);
    await user.keyboard("/");

    expect(search.value).toBe("acme/");
  });

  it("ignores a modified keypress, which belongs to the browser", async () => {
    const onCreate = vi.fn();
    render(<Page onCreate={onCreate} />);

    await user.keyboard("{Meta>}n{/Meta}");
    await user.keyboard("{Control>}n{/Control}");
    await user.keyboard("{Alt>}n{/Alt}");

    expect(onCreate).not.toHaveBeenCalled();
  });

  it("does nothing while a dialog is open", async () => {
    // Inside a dialog, "n" is a letter someone is typing.
    const onCreate = vi.fn();
    render(<Page onCreate={onCreate} />);

    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("data-state", "open");
    document.body.append(dialog);

    await user.keyboard("n");
    expect(onCreate).not.toHaveBeenCalled();
  });
});

describe("isTypingInFormField", () => {
  it.each(["INPUT", "TEXTAREA", "SELECT"])("recognises a %s", (tag) => {
    expect(isTypingInFormField(document.createElement(tag))).toBe(true);
  });

  it("recognises a contenteditable element", () => {
    const node = document.createElement("div");
    node.contentEditable = "true";
    // happy-dom does not derive isContentEditable from the attribute.
    Object.defineProperty(node, "isContentEditable", { value: true });
    expect(isTypingInFormField(node)).toBe(true);
  });

  it("does not treat an ordinary element as a field", () => {
    expect(isTypingInFormField(document.createElement("div"))).toBe(false);
    expect(isTypingInFormField(null)).toBe(false);
  });
});

