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
