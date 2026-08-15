import { z } from "zod";
import { DURATION_OPTIONS, type DurationValue } from "@/lib/licenses/expiration";

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
