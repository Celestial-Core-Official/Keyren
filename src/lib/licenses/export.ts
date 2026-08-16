import type { EffectiveStatus } from "./types";

/**
 * Pure serializers for the two exports Keyren offers.
 *
 * No database handle, no Clerk, no React. Everything here is a function from
 * rows to a string, which is what makes the CSV-injection hardening below
 * directly testable rather than something that has to be observed through a
 * download.
 *
 * The two exports are deliberately different shapes:
 *
 *   - `plaintext*` runs ONCE, on the immediate batch-creation result, while
 *     the keys still exist in memory. There is no endpoint that reproduces it.
 *   - `metadata*` runs over stored records at any time and, by construction,
 *     has no column that could carry a key.
 */

export const PLAINTEXT_CSV_COLUMNS = [
  "label",
  "licenseKey",
  "applicationId",
  "expiresAt",
  "hwidLocked",
  "createdAt",
] as const;

export const METADATA_CSV_COLUMNS = [
  "label",
  "maskedKey",
  "applicationId",
  "status",
  "effectiveStatus",
  "expiresAt",
  "hwidLocked",
  "activatedAt",
  "lastSeenAt",
  "createdAt",
] as const;

export type PlaintextLicenseRow = {
  label: string | null;
  licenseKey: string;
  applicationId: string;
  expiresAt: Date | null;
  hwidLocked: boolean;
  createdAt: Date;
};

export type LicenseMetadataRow = {
  label: string | null;
  maskedKey: string;
  applicationId: string;
  status: "active" | "revoked";
  effectiveStatus: EffectiveStatus;
  expiresAt: Date | null;
  hwidLocked: boolean;
  activatedAt: Date | null;
  lastSeenAt: Date | null;
  createdAt: Date;
};

export type PlaintextJsonRow = {
  label: string | null;
  licenseKey: string;
  applicationId: string;
  expiresAt: string | null;
  hwidLocked: boolean;
  createdAt: string;
};

export type MetadataJsonRow = {
  label: string | null;
  maskedKey: string;
  applicationId: string;
  status: "active" | "revoked";
  effectiveStatus: EffectiveStatus;
  expiresAt: string | null;
  hwidLocked: boolean;
  activatedAt: string | null;
  lastSeenAt: string | null;
  createdAt: string;
};

/** RFC 4180 line ending, which is what spreadsheet software expects. */
const CRLF = "\r\n";

/**
 * Characters that make a spreadsheet treat a cell as a formula.
 *
 * `=`, `+`, `-` and `@` are the four evaluated prefixes. Tab and carriage
 * return are included because parsers strip leading whitespace before making
 * the decision, so `\t=1+1` reaches the same evaluator that `=1+1` does.
 */
const FORMULA_PREFIXES = ["=", "+", "-", "@", "\t", "\r"];

/**
 * Prevents a cell from being executed when the file is opened.
 *
 * A label is free text, and on a licensing dashboard it frequently carries a
 * customer-supplied order reference. Excel, Sheets and LibreOffice all
 * evaluate a leading `=`, so `=HYPERLINK(...)` or `=cmd|'/c calc'!A0` in a
 * label turns an export into code execution on the machine of whoever opens
 * it. A leading apostrophe forces the cell to be read as text; it is not part
 * of the value and spreadsheets do not display it.
 *
 * Applied before quoting, so a neutralized cell that also contains a comma
 * still gets its quotes.
 */
function neutralizeFormula(value: string): string {
  const first = value.charAt(0);
  return FORMULA_PREFIXES.includes(first) ? `'${value}` : value;
}

/**
 * Quotes a field when RFC 4180 requires it.
 *
 * Leading or trailing whitespace is also quoted: unquoted, some readers trim
 * it, and a label the developer deliberately padded would come back different.
 */
function quoteField(value: string): string {
  const needsQuotes =
    value.includes(",") ||
    value.includes('"') ||
    value.includes("\n") ||
    value.includes("\r") ||
    value !== value.trim();

  if (!needsQuotes) return value;
  return `"${value.replace(/"/g, '""')}"`;
}

function cell(value: string | number | boolean | Date | null | undefined): string {
  if (value === null || value === undefined) return "";
  const text = value instanceof Date ? value.toISOString() : String(value);
  return quoteField(neutralizeFormula(text));
}

function toCsv(header: readonly string[], rows: readonly (readonly unknown[])[]): string {
  const lines = [header.join(",")];
  for (const row of rows) {
    lines.push(row.map((value) => cell(value as never)).join(","));
  }
  return `${lines.join(CRLF)}${CRLF}`;
}

export function plaintextToCsv(rows: readonly PlaintextLicenseRow[]): string {
  return toCsv(
    PLAINTEXT_CSV_COLUMNS,
    rows.map((row) => [
      row.label,
      row.licenseKey,
      row.applicationId,
      row.expiresAt,
      row.hwidLocked,
      row.createdAt,
    ]),
  );
}

export function metadataToCsv(rows: readonly LicenseMetadataRow[]): string {
  return toCsv(
    METADATA_CSV_COLUMNS,
    rows.map((row) => [
      row.label,
      row.maskedKey,
      row.applicationId,
      row.status,
      row.effectiveStatus,
      row.expiresAt,
      row.hwidLocked,
      row.activatedAt,
      row.lastSeenAt,
      row.createdAt,
    ]),
  );
}

const iso = (value: Date | null): string | null => (value ? value.toISOString() : null);

export function plaintextToJson(
  rows: readonly PlaintextLicenseRow[],
): PlaintextJsonRow[] {
  return rows.map((row) => ({
    label: row.label,
    licenseKey: row.licenseKey,
    applicationId: row.applicationId,
    expiresAt: iso(row.expiresAt),
    hwidLocked: row.hwidLocked,
    createdAt: row.createdAt.toISOString(),
  }));
}

export function metadataToJson(rows: readonly LicenseMetadataRow[]): MetadataJsonRow[] {
  return rows.map((row) => ({
    label: row.label,
    maskedKey: row.maskedKey,
    applicationId: row.applicationId,
    status: row.status,
    effectiveStatus: row.effectiveStatus,
    expiresAt: iso(row.expiresAt),
    hwidLocked: row.hwidLocked,
    activatedAt: iso(row.activatedAt),
    lastSeenAt: iso(row.lastSeenAt),
    createdAt: row.createdAt.toISOString(),
  }));
}

const pad = (value: number, width = 2): string => String(value).padStart(width, "0");

/**
 * `<application-slug>-licenses-YYYY-MM-DD-HHmmss.<ext>`, in UTC.
 *
 * UTC rather than the viewer's locale so two developers in different
 * timezones exporting the same batch get the same filename, and so the name
 * agrees with the ISO timestamps inside the file.
 *
 * The slug is derived from a developer-supplied application name, so it is
 * reduced to a conservative character set here as well — a name is not
 * allowed to introduce a path separator or a leading dot into a filename the
 * browser is about to write to disk.
 */
export function exportFilename(
  applicationSlug: string,
  extension: "csv" | "json",
  at: Date = new Date(),
): string {
  const safeSlug = applicationSlug
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  const stamp = [
    `${at.getUTCFullYear()}-${pad(at.getUTCMonth() + 1)}-${pad(at.getUTCDate())}`,
    `${pad(at.getUTCHours())}${pad(at.getUTCMinutes())}${pad(at.getUTCSeconds())}`,
  ].join("-");

  const prefix = safeSlug === "" ? "" : `${safeSlug}-`;
  return `${prefix}licenses-${stamp}.${extension}`;
}
