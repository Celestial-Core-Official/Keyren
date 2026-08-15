import { z } from "zod";
import { DURATION_OPTIONS, type DurationValue } from "@/lib/licenses/expiration";
import {
  ACTIVATION_FILTERS,
  DEFAULT_LICENSE_QUERY,
  LICENSE_SORTS,
  LICENSE_STATUS_FILTERS,
  LOCK_FILTERS,
  PAGE_SIZES,
  SEARCH_MAX_LENGTH,
  type LicenseQuery,
} from "@/lib/licenses/types";
import {
  DEFAULT_PRODUCT_QUERY,
  PRODUCT_SORTS,
  type ProductQuery,
} from "@/lib/products/types";

/**
 * Input schemas for dashboard server actions.
 *
 * None of these contain an `ownerId`. That is the point: the only trusted
 * source of ownership is Clerk's server-side session, so there is nowhere for
 * a crafted form submission to declare one.
 */

export const productIdSchema = z.string().regex(/^prod_[0-9A-Za-z]+$/, "Invalid product id");
export const licenseIdSchema = z.string().regex(/^lic_[0-9A-Za-z]+$/, "Invalid license id");

const productName = z.string().trim().min(1, "Name is required").max(200, "Name is too long");

/**
 * An optional free-text field that normalizes to `string | null`.
 *
 * Three inputs have to collapse to the same result: a missing key, an
 * untouched text input (which submits `""`), and a field the developer
 * blanked out. All three mean "no value", and letting empty strings reach the
 * column would quietly defeat every `IS NULL` check the dashboard makes and
 * render as an empty label rather than "Unlabeled license".
 *
 * Length is measured after trimming, so a value padded with whitespace is
 * judged on what actually gets stored.
 *
 * `z.preprocess` rather than `.transform().pipe()`: Zod 4 treats a piped
 * schema as non-optional at the object-key level even when its input union
 * accepts `undefined`, so the `.pipe()` form rejects a field the form simply
 * did not submit. Preprocessing runs ahead of that check and normalizes the
 * absent case to `null` like every other empty one.
 */
function optionalText(max: number, field: string) {
  return z.preprocess(
    (value) => {
      if (typeof value !== "string") return null;
      const trimmed = value.trim();
      return trimmed === "" ? null : trimmed;
    },
    z
      .string()
      .max(max, `${field} must be ${max.toLocaleString("en-US")} characters or fewer`)
      .nullable(),
  );
}

export const LICENSE_LABEL_MAX = 120;
export const LICENSE_NOTES_MAX = 1000;

export const licenseLabelSchema = optionalText(LICENSE_LABEL_MAX, "Label");
export const licenseNotesSchema = optionalText(LICENSE_NOTES_MAX, "Notes");

export const editLicenseDetailsSchema = z.object({
  licenseId: licenseIdSchema,
  label: licenseLabelSchema,
  notes: licenseNotesSchema,
});

export type EditLicenseDetailsInput = z.infer<typeof editLicenseDetailsSchema>;

export const createProductSchema = z.object({ name: productName });

export const renameProductSchema = z.object({
  productId: productIdSchema,
  name: productName,
});

// Cast to a literal tuple, not a widened `[string, ...string[]]`: z.enum()'s
// `const T extends readonly string[]` type parameter infers its output type
// directly from this array's element type, so widening to `string` here would
// make every parsed `duration` a plain `string` instead of `DurationValue`,
// silently breaking the discriminated union below.
const durationValues = DURATION_OPTIONS.map((option) => option.value) as [
  DurationValue,
  ...DurationValue[],
];

export const createLicenseSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("permanent"),
    productId: productIdSchema,
    hwidLocked: z.boolean().default(true),
  }),
  z.object({
    mode: z.literal("date"),
    productId: productIdSchema,
    hwidLocked: z.boolean().default(true),
    expiresAt: z.coerce.date(),
  }),
  z.object({
    mode: z.literal("duration"),
    productId: productIdSchema,
    hwidLocked: z.boolean().default(true),
    duration: z.enum(durationValues),
  }),
]);

export const licenseActionSchema = z.object({ licenseId: licenseIdSchema });

// ---------------------------------------------------------------------------
// URL search parameters
// ---------------------------------------------------------------------------

/**
 * What Next.js hands a page as `searchParams`: a value may be absent, a single
 * string, or an array when the parameter repeats in the URL.
 */
export type RawSearchParams = Record<string, string | string[] | undefined>;

function firstValue(raw: string | string[] | undefined): string | undefined {
  return Array.isArray(raw) ? raw[0] : raw;
}

/**
 * Picks a value out of a fixed set, falling back rather than failing.
 *
 * Everything here comes from the address bar, so it is all attacker-controlled
 * and none of it may throw: a bookmark from an older release, a hand-edited
 * URL, or a crawler appending junk must still render the page.
 */
function oneOf<T extends string>(
  raw: string | string[] | undefined,
  allowed: readonly T[],
  fallback: T,
): T {
  const value = firstValue(raw);
  return allowed.includes(value as T) ? (value as T) : fallback;
}

export function parseLicenseQuery(params: RawSearchParams): LicenseQuery {
  const rawPage = Number(firstValue(params.page));
  const page =
    Number.isSafeInteger(rawPage) && rawPage >= 1 ? rawPage : DEFAULT_LICENSE_QUERY.page;

  const rawPageSize = Number(firstValue(params.pageSize));
  const pageSize = PAGE_SIZES.find((size) => size === rawPageSize) ?? DEFAULT_LICENSE_QUERY.pageSize;

  return {
    // Truncated rather than rejected: an over-long term is a bad bookmark, not
    // a reason to refuse to show the developer their own licenses.
    q: (firstValue(params.q) ?? "").trim().slice(0, SEARCH_MAX_LENGTH),
    status: oneOf(params.status, LICENSE_STATUS_FILTERS, DEFAULT_LICENSE_QUERY.status),
    activation: oneOf(params.activation, ACTIVATION_FILTERS, DEFAULT_LICENSE_QUERY.activation),
    lock: oneOf(params.lock, LOCK_FILTERS, DEFAULT_LICENSE_QUERY.lock),
    sort: oneOf(params.sort, LICENSE_SORTS, DEFAULT_LICENSE_QUERY.sort),
    page,
    pageSize,
  };
}

export function parseProductQuery(params: RawSearchParams): ProductQuery {
  return {
    q: (firstValue(params.q) ?? "").trim().slice(0, SEARCH_MAX_LENGTH),
    sort: oneOf(params.sort, PRODUCT_SORTS, DEFAULT_PRODUCT_QUERY.sort),
  };
}
