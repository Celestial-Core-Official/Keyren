import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BatchResultDialog } from "@/components/licenses/batch-result-dialog";
import type { CreatedLicense } from "@/lib/licenses/batch";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

const download = vi.hoisted(() => ({ downloadTextFile: vi.fn() }));
vi.mock("@/lib/download", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/download")>()),
  downloadTextFile: download.downloadTextFile,
}));

function created(count: number): CreatedLicense[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `lic_${index}`,
    label: count > 1 ? `Acme Corp ${index + 1}` : "Acme Corp",
    licenseKey: `KEYREN-AAAAAAAA-BBBBBBBB-CCCCCCCC-DDDDDD${String(index).padStart(2, "0")}`,
    keyLast4: `DD${String(index).padStart(2, "0")}`,
    productId: "prod_abc",
    expiresAt: null,
    hwidLocked: true,
    createdAt: new Date("2026-08-15T09:30:00.000Z"),
  }));
}

function renderDialog(count = 3, handlers: Partial<{ onAcknowledge: () => void; onGenerateAnother: () => void }> = {}) {
  const onAcknowledge = vi.fn();
  const onGenerateAnother = vi.fn();

  render(
    <BatchResultDialog
      licenses={created(count)}
      productId="prod_abc"
      productSlug="seliware-key"
      onAcknowledge={handlers.onAcknowledge ?? onAcknowledge}
      onGenerateAnother={handlers.onGenerateAnother ?? onGenerateAnother}
    />,
  );

  return { onAcknowledge, onGenerateAnother };
}

function acknowledgement() {
  return screen.getByRole("checkbox");
}

beforeEach(() => {
  toast.success.mockClear();
  toast.error.mockClear();
  download.downloadTextFile.mockClear();
});

describe("BatchResultDialog — showing the keys", () => {
  it("lists every key in the batch", () => {
    renderDialog(3);

    for (const license of created(3)) {
      expect(screen.getByText(license.licenseKey)).toBeTruthy();
    }
  });

  it("shows the label column only for a batch", () => {
    renderDialog(1);
    expect(screen.queryByText("Label")).toBeNull();

    screen.getByText(created(1)[0]!.licenseKey);
  });

  it("names the count in the heading for a batch", () => {
    renderDialog(5);
    expect(screen.getByText(/save these 5 keys now/i)).toBeTruthy();
  });

  it("renders each key as selectable text for a blocked clipboard", () => {
    renderDialog(1);
    const code = screen.getByText(created(1)[0]!.licenseKey);
    expect(code.className).toContain("select-all");
  });
});

describe("BatchResultDialog — the acknowledgement gate", () => {
  it("starts with Done disabled", () => {
    renderDialog();
    expect(screen.getByRole("button", { name: "Done" }).hasAttribute("disabled")).toBe(true);
  });

  it("enables Done only after the box is checked", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(acknowledgement());
    expect(screen.getByRole("button", { name: "Done" }).hasAttribute("disabled")).toBe(false);
  });

  it("re-disables Done if the box is unchecked again", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(acknowledgement());
    await user.click(acknowledgement());
    expect(screen.getByRole("button", { name: "Done" }).hasAttribute("disabled")).toBe(true);
  });

  it("has no close button to reach for", () => {
    // Escape, an outside click and a close button are all reflexes, and any
    // of them would destroy keys the developer has not saved.
    renderDialog();
    expect(screen.queryByRole("button", { name: /^close$/i })).toBeNull();
  });

  it("does not close on Escape before acknowledgement", async () => {
    const user = userEvent.setup();
    const { onAcknowledge } = renderDialog();

    await user.keyboard("{Escape}");

    expect(onAcknowledge).not.toHaveBeenCalled();
    expect(screen.getByText(created(3)[0]!.licenseKey)).toBeTruthy();
  });

  it("does not close on Escape even after acknowledgement", async () => {
    // Acknowledging enables Done; it does not make Escape a second exit.
    const user = userEvent.setup();
    const { onAcknowledge } = renderDialog();

    await user.click(acknowledgement());
    await user.keyboard("{Escape}");

    expect(onAcknowledge).not.toHaveBeenCalled();
  });

  it("reports the acknowledgement only when Done is pressed", async () => {
    const user = userEvent.setup();
    const { onAcknowledge } = renderDialog();

    await user.click(acknowledgement());
    await user.click(screen.getByRole("button", { name: "Done" }));

    expect(onAcknowledge).toHaveBeenCalledTimes(1);
  });

  it("gates Generate another behind the same acknowledgement", async () => {
    const user = userEvent.setup();
    const { onGenerateAnother } = renderDialog();

    const button = screen.getByRole("button", { name: /generate another/i });
    expect(button.hasAttribute("disabled")).toBe(true);

    await user.click(acknowledgement());
    await user.click(screen.getByRole("button", { name: /generate another/i }));
    expect(onGenerateAnother).toHaveBeenCalledTimes(1);
  });
});

describe("BatchResultDialog — exports", () => {
  it("downloads a CSV named for the product and the moment", async () => {
    const user = userEvent.setup();
    renderDialog(2);

    await user.click(screen.getByRole("button", { name: /download csv/i }));

    const [filename, contents, mime] = download.downloadTextFile.mock.calls[0]!;
    expect(filename).toMatch(/^seliware-key-licenses-\d{4}-\d{2}-\d{2}-\d{6}\.csv$/);
    expect(mime).toContain("text/csv");
    expect(contents).toContain("label,licenseKey,productId,expiresAt,hwidLocked,createdAt");
    expect(contents).toContain(created(2)[0]!.licenseKey);
  });

  it("downloads JSON containing every key", async () => {
    const user = userEvent.setup();
    renderDialog(2);

    await user.click(screen.getByRole("button", { name: /download json/i }));

    const [filename, contents] = download.downloadTextFile.mock.calls[0]!;
    expect(filename).toMatch(/\.json$/);

    const parsed = JSON.parse(contents as string) as { licenseKey: string }[];
    expect(parsed.map((row) => row.licenseKey)).toEqual(
      created(2).map((license) => license.licenseKey),
    );
  });

  it("allows exporting before acknowledging, since that is how you save them", async () => {
    const user = userEvent.setup();
    renderDialog();

    expect(
      screen.getByRole("button", { name: /download csv/i }).hasAttribute("disabled"),
    ).toBe(false);
    await user.click(screen.getByRole("button", { name: /download csv/i }));
    expect(download.downloadTextFile).toHaveBeenCalled();
  });

  it("copies every key at once, newline separated", async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn(async () => undefined) },
    });

    renderDialog(3);
    await user.click(screen.getByRole("button", { name: /copy all keys/i }));

    const written = (navigator.clipboard.writeText as ReturnType<typeof vi.fn>).mock
      .calls[0]![0] as string;
    expect(written.split("\n")).toEqual(created(3).map((license) => license.licenseKey));
  });
});
