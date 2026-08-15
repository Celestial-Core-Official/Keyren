import { describe, expect, it } from "vitest";
import {
  METADATA_CSV_COLUMNS,
  PLAINTEXT_CSV_COLUMNS,
  exportFilename,
  metadataToCsv,
  metadataToJson,
  plaintextToCsv,
  plaintextToJson,
  type LicenseMetadataRow,
  type PlaintextLicenseRow,
} from "@/lib/licenses/export";

const CREATED = new Date("2026-08-15T09:30:00.000Z");
const EXPIRES = new Date("2026-12-31T23:59:59.999Z");

function plaintextRow(overrides: Partial<PlaintextLicenseRow> = {}): PlaintextLicenseRow {
  return {
    label: "Acme Corp",
    licenseKey: "KEYREN-ABCDEFGH-ABCDEFGH-ABCDEFGH-ABCDWXYZ",
    productId: "prod_abc123",
    expiresAt: EXPIRES,
    hwidLocked: true,
    createdAt: CREATED,
    ...overrides,
  };
}

function metadataRow(overrides: Partial<LicenseMetadataRow> = {}): LicenseMetadataRow {
  return {
    label: "Acme Corp",
    maskedKey: "KEYREN-••••-••••-••••-WXYZ",
    productId: "prod_abc123",
    status: "active",
    effectiveStatus: "active",
    expiresAt: EXPIRES,
    hwidLocked: true,
    activatedAt: null,
    lastSeenAt: null,
    createdAt: CREATED,
    ...overrides,
  };
}

function lines(csv: string): string[] {
  // Split on newlines that are not inside a quoted field.
  return csv.split(/\r?\n(?=(?:[^"]*"[^"]*")*[^"]*$)/);
}

describe("plaintextToCsv — structure", () => {
  it("uses the exact documented column order", () => {
    expect(PLAINTEXT_CSV_COLUMNS).toEqual([
      "label",
      "licenseKey",
      "productId",
      "expiresAt",
      "hwidLocked",
      "createdAt",
    ]);
    expect(lines(plaintextToCsv([]))[0]).toBe(
      "label,licenseKey,productId,expiresAt,hwidLocked,createdAt",
    );
  });

  it("emits a header even with no rows", () => {
    expect(plaintextToCsv([])).toBe(
      "label,licenseKey,productId,expiresAt,hwidLocked,createdAt\r\n",
    );
  });

  it("writes one line per license", () => {
    const csv = plaintextToCsv([plaintextRow(), plaintextRow(), plaintextRow()]);
    expect(lines(csv.trimEnd())).toHaveLength(4);
  });

  it("renders dates as ISO 8601 in UTC and a permanent licence as empty", () => {
    const csv = plaintextToCsv([plaintextRow({ expiresAt: null })]);
    const row = lines(csv)[1]!;

    expect(row).toContain("2026-08-15T09:30:00.000Z");
    expect(row).toContain(",,"); // empty expiresAt between two commas
  });

  it("renders the device lock as true/false", () => {
    expect(plaintextToCsv([plaintextRow({ hwidLocked: false })])).toContain("false");
    expect(plaintextToCsv([plaintextRow({ hwidLocked: true })])).toContain("true");
  });

  it("renders an absent label as an empty field", () => {
    const row = lines(plaintextToCsv([plaintextRow({ label: null })]))[1]!;
    expect(row.startsWith(",KEYREN-")).toBe(true);
  });
});

describe("plaintextToCsv — quoting", () => {
  it("quotes a field containing a comma", () => {
    const csv = plaintextToCsv([plaintextRow({ label: "Acme, Inc." })]);
    expect(csv).toContain('"Acme, Inc."');
  });

  it("doubles embedded quotes", () => {
    const csv = plaintextToCsv([plaintextRow({ label: 'The "Big" Deal' })]);
    expect(csv).toContain('"The ""Big"" Deal"');
  });

  it("quotes a field containing a newline and keeps it intact", () => {
    const csv = plaintextToCsv([plaintextRow({ label: "Line one\nLine two" })]);
    expect(csv).toContain('"Line one\nLine two"');
    // The embedded newline must not become a new record.
    expect(lines(csv.trimEnd())).toHaveLength(2);
  });

  it("quotes a field containing a carriage return", () => {
    const csv = plaintextToCsv([plaintextRow({ label: "Line one\r\nLine two" })]);
    expect(csv).toContain('"Line one\r\nLine two"');
  });

  it("preserves Unicode without escaping it", () => {
    const csv = plaintextToCsv([plaintextRow({ label: "顧客 — Ünïcode 🔑" })]);
    expect(csv).toContain("顧客 — Ünïcode 🔑");
  });

  it("does not quote a field that needs no quoting", () => {
    const csv = plaintextToCsv([plaintextRow({ label: "Acme Corp" })]);
    expect(csv).toContain("Acme Corp,KEYREN-");
    expect(csv).not.toContain('"Acme Corp"');
  });
});

describe("plaintextToCsv — spreadsheet formula hardening", () => {
  // A label is free text a developer typed, but it can also arrive from a
  // customer-supplied order reference. Opened in Excel, Sheets or LibreOffice,
  // a cell starting with any of these is evaluated as a formula rather than
  // shown as text — which is how a CSV export becomes remote code execution on
  // the machine of whoever opens it.
  it.each(["=", "+", "-", "@"])("neutralizes a cell starting with %s", (character) => {
    const csv = plaintextToCsv([
      plaintextRow({ label: `${character}HYPERLINK("http://evil","click")` }),
    ]);

    expect(csv).toContain(`'${character}HYPERLINK`);
  });

  it("neutralizes a cell starting with a tab or carriage return", () => {
    // Leading whitespace is stripped by spreadsheet parsers before the
    // formula check, so these reach the same evaluator.
    expect(plaintextToCsv([plaintextRow({ label: "\t=1+1" })])).toContain("'\t=1+1");
    expect(plaintextToCsv([plaintextRow({ label: "\r=1+1" })])).toContain("'\r=1+1");
  });

  it("still quotes a neutralized cell that also contains a comma", () => {
    const csv = plaintextToCsv([plaintextRow({ label: "=SUM(A1,A2)" })]);
    expect(csv).toContain(`"'=SUM(A1,A2)"`);
  });

  it("leaves an ordinary label untouched", () => {
    const csv = plaintextToCsv([plaintextRow({ label: "Acme Corp" })]);
    expect(csv).not.toContain("'Acme");
  });

  it("does not prefix a negative number appearing mid-field", () => {
    const csv = plaintextToCsv([plaintextRow({ label: "Seat -5 replacement" })]);
    expect(csv).toContain("Seat -5 replacement");
    expect(csv).not.toContain("'Seat");
  });

  it("hardens every column, not only the label", () => {
    const csv = plaintextToCsv([
      plaintextRow({ productId: "=cmd|'/c calc'!A0", label: null }),
    ]);
    expect(csv).toContain(`'=cmd`);
  });
});

describe("plaintextToJson", () => {
  it("uses the documented camelCase keys", () => {
    const [row] = plaintextToJson([plaintextRow()]);
    expect(Object.keys(row!)).toEqual([
      "label",
      "licenseKey",
      "productId",
      "expiresAt",
      "hwidLocked",
      "createdAt",
    ]);
  });

  it("serializes dates as ISO strings and permanence as null", () => {
    const [row] = plaintextToJson([plaintextRow({ expiresAt: null })]);
    expect(row!.createdAt).toBe("2026-08-15T09:30:00.000Z");
    expect(row!.expiresAt).toBeNull();
  });

  it("keeps hwidLocked a real boolean rather than a string", () => {
    const [row] = plaintextToJson([plaintextRow({ hwidLocked: false })]);
    expect(row!.hwidLocked).toBe(false);
  });

  it("does not escape or mangle a label needing CSV quoting", () => {
    // JSON has no formula problem, so nothing is prefixed here.
    const [row] = plaintextToJson([plaintextRow({ label: '=SUM(A1,A2) "x"' })]);
    expect(row!.label).toBe('=SUM(A1,A2) "x"');
  });

  it("produces an array, so an empty batch is [] rather than null", () => {
    expect(plaintextToJson([])).toEqual([]);
  });
});

describe("metadata export", () => {
  it("uses the documented column order", () => {
    expect(METADATA_CSV_COLUMNS).toEqual([
      "label",
      "maskedKey",
      "productId",
      "status",
      "effectiveStatus",
      "expiresAt",
      "hwidLocked",
      "activatedAt",
      "lastSeenAt",
      "createdAt",
    ]);
  });

  it("has no column that could carry a plaintext key", () => {
    // The single most important property of this file. A historical export
    // must never be able to reveal a key.
    expect(METADATA_CSV_COLUMNS).not.toContain("licenseKey");
    expect(Object.keys(metadataToJson([metadataRow()])[0]!)).not.toContain("licenseKey");
  });

  it("carries only the masked reference", () => {
    const csv = metadataToCsv([metadataRow()]);
    expect(csv).toContain("KEYREN-••••-••••-••••-WXYZ");
  });

  it("renders never-activated timestamps as empty", () => {
    const csv = metadataToCsv([metadataRow()]);
    expect(csv.trimEnd().endsWith(",,,2026-08-15T09:30:00.000Z")).toBe(true);
  });

  it("includes both the stored and effective status", () => {
    const [row] = metadataToJson([
      metadataRow({ status: "active", effectiveStatus: "expired" }),
    ]);
    expect(row!.status).toBe("active");
    expect(row!.effectiveStatus).toBe("expired");
  });

  it("applies the same formula hardening as the plaintext export", () => {
    const csv = metadataToCsv([metadataRow({ label: "@SUM(1)" })]);
    expect(csv).toContain("'@SUM(1)");
  });
});

describe("exportFilename", () => {
  const at = new Date("2026-08-15T09:30:07.000Z");

  it("uses the documented shape", () => {
    expect(exportFilename("seliware-key", "csv", at)).toBe(
      "seliware-key-licenses-2026-08-15-093007.csv",
    );
  });

  it("uses UTC rather than the viewer's timezone", () => {
    // Two developers in different timezones exporting the same batch must get
    // the same filename, and it must match the ISO timestamps inside the file.
    expect(exportFilename("p", "json", new Date("2026-01-01T23:59:59.000Z"))).toBe(
      "p-licenses-2026-01-01-235959.json",
    );
  });

  it("zero-pads every component", () => {
    expect(exportFilename("p", "csv", new Date("2026-02-03T04:05:06.000Z"))).toBe(
      "p-licenses-2026-02-03-040506.csv",
    );
  });

  it("falls back when a product has no usable slug", () => {
    expect(exportFilename("", "csv", at)).toBe("licenses-2026-08-15-093007.csv");
  });

  it("strips characters that are not safe in a filename", () => {
    // A slug is derived from a developer-supplied product name, so it must not
    // be able to introduce a path separator or a leading dot.
    expect(exportFilename("../../etc/passwd", "csv", at)).toBe(
      "etc-passwd-licenses-2026-08-15-093007.csv",
    );
  });
});
