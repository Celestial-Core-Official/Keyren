import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CommandPalette } from "@/components/dashboard/command-palette";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const search = vi.hoisted(() => ({ searchLicensesAction: vi.fn(async () => []) }));
vi.mock("@/app/dashboard/search-actions", () => search);

const APPLICATIONS = [
  { id: "app_one", name: "Seliware Key", disabled: false },
  { id: "app_two", name: "Ledger", disabled: true },
];

let user: ReturnType<typeof userEvent.setup>;

beforeEach(() => {
  user = userEvent.setup();
  router.push.mockClear();
  document.body.innerHTML = "";
});

/** A modal already owning the screen, of the kind the palette must not cover. */
function OpenDialog() {
  return (
    <Dialog open>
      <DialogContent>
        <DialogTitle>Save these keys now</DialogTitle>
      </DialogContent>
    </Dialog>
  );
}

describe("the ⌘K shortcut", () => {
  it("opens the palette", async () => {
    render(<CommandPalette applications={APPLICATIONS} />);
    await user.keyboard("{Meta>}k{/Meta}");

    expect(screen.getByPlaceholderText(/Search applications/)).toBeTruthy();
  });

  it("closes the palette it opened", async () => {
    render(<CommandPalette applications={APPLICATIONS} />);
    await user.keyboard("{Meta>}k{/Meta}");
    await user.keyboard("{Meta>}k{/Meta}");

    expect(screen.queryByPlaceholderText(/Search applications/)).toBeNull();
  });

  it("stands down while another dialog is open", async () => {
    // The case this exists for is the show-once key reveal, which cannot be
    // dismissed by Escape, by a click outside, or by a close button precisely
    // because each would destroy plaintext keys the developer has not saved.
    // A palette on top would put a navigation one keystroke away, and the keys
    // exist nowhere else once that tree unmounts.
    render(
      <>
        <OpenDialog />
        <CommandPalette applications={APPLICATIONS} />
      </>,
    );

    await user.keyboard("{Meta>}k{/Meta}");

    expect(screen.queryByPlaceholderText(/Search applications/)).toBeNull();
    expect(screen.getByText("Save these keys now")).toBeTruthy();
  });
});

describe("palette entries", () => {
  it("navigates to the application it was told to", async () => {
    render(<CommandPalette applications={APPLICATIONS} />);
    await user.keyboard("{Meta>}k{/Meta}");

    await user.click(screen.getByRole("button", { name: /Seliware Key/ }));

    expect(router.push).toHaveBeenCalledWith("/dashboard/applications/app_one");
  });

  it("asks the applications page to open the create dialog", async () => {
    render(<CommandPalette applications={APPLICATIONS} />);
    await user.keyboard("{Meta>}k{/Meta}");

    await user.click(screen.getByRole("button", { name: /New application/ }));

    expect(router.push).toHaveBeenCalledWith("/dashboard/applications?new=1");
  });
});
