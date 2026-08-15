"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { env } from "@/env";
import { requireDeveloperId } from "@/lib/auth/require-developer";
import {
  actionFailure,
  actionSuccess,
  fieldErrorsFrom,
  firstIssueMessage,
  safeErrorMessage,
  type ActionState,
} from "@/lib/actions/state";
import { createLicenseBatch, type CreatedLicense } from "@/lib/licenses/batch";
import { licenseDisplayName } from "@/lib/licenses/display";
import type { ExpirationInput } from "@/lib/licenses/expiration";
import {
  deleteLicense,
  resetActivation,
  restoreLicense,
  revokeLicense,
  updateLicenseDetails,
  type LicenseView,
} from "@/lib/licenses/service";
import {
  createLicenseSchema,
  editLicenseDetailsSchema,
  licenseActionSchema,
  productIdSchema,
} from "@/lib/validation/dashboard";

/**
 * Server actions are thin: authenticate, validate, delegate, describe.
 *
 * Every one re-derives `ownerId` from Clerk. A server action is a public HTTP
 * endpoint with a generated name — it is not protected by the fact that only
 * the dashboard calls it, so it re-authorizes from scratch and never reads an
 * owner from the form.
 */

export type LicenseActionState = ActionState<null>;

/**
 * The ONLY code path in Keyren that returns plaintext license keys.
 *
 * They travel: generator -> this response -> the result dialog. They are never
 * written to the database, never logged, and no other endpoint can reproduce
 * them. Once the dialog is acknowledged they are gone, which is why it demands
 * an explicit acknowledgement first.
 */
export type CreateLicenseState = ActionState<{ licenses: CreatedLicense[] } | null>;

function revalidateProduct(productId: string): void {
  revalidatePath(`/dashboard/products/${productId}/licenses`);
  revalidatePath(`/dashboard/products/${productId}`);
}

export async function createLicenseAction(
  _previous: CreateLicenseState,
  formData: FormData,
): Promise<CreateLicenseState> {
  const ownerId = await requireDeveloperId();

  const parsed = createLicenseSchema.safeParse({
    productId: formData.get("productId"),
    mode: formData.get("mode"),
    duration: formData.get("duration") ?? undefined,
    expiresAt: formData.get("expiresAt") ?? undefined,
    quantity: formData.get("quantity") ?? undefined,
    label: formData.get("label"),
    notes: formData.get("notes"),
    // An unchecked box submits nothing at all, so absence must mean locked.
    hwidLocked: formData.get("hwidLocked") !== "off",
  });

  if (!parsed.success) {
    return actionFailure(firstIssueMessage(parsed.error), fieldErrorsFrom(parsed.error));
  }

  const expiration: ExpirationInput =
    parsed.data.mode === "permanent"
      ? { mode: "permanent" }
      : parsed.data.mode === "date"
        ? { mode: "date", expiresAt: parsed.data.expiresAt }
        : { mode: "duration", duration: parsed.data.duration };

  try {
    const created = await createLicenseBatch(db, ownerId, {
      productId: parsed.data.productId,
      quantity: parsed.data.quantity,
      expiration,
      hwidLocked: parsed.data.hwidLocked,
      secret: env.KEYREN_LICENSE_HMAC_SECRET,
      label: parsed.data.label,
      notes: parsed.data.notes,
    });

    revalidateProduct(parsed.data.productId);

    return actionSuccess(
      created.length === 1
        ? "License generated. Save the key before closing."
        : `${created.length} licenses generated. Save the keys before closing.`,
      { licenses: created },
    );
  } catch (error) {
    // A past expiry is the developer's to fix, so it survives verbatim.
    // Anything else — driver text, a constraint name, a stack — is replaced.
    return actionFailure(
      safeErrorMessage(error, "Could not generate licenses. Try again."),
      // Attributed to the field that caused it, so the date input is marked
      // rather than the developer having to guess which box is wrong.
      error instanceof Error && error.message.startsWith("Expiration date")
        ? { expiresAt: error.message }
        : {},
    );
  }
}

/**
 * Shared shape for the single-license mutations.
 *
 * `describe` builds the confirmation from the row the service returned, so the
 * message names the license that actually changed rather than echoing
 * something the browser supplied.
 */
function licenseMutation(
  run: (ownerId: string, licenseId: string) => Promise<LicenseView>,
  describe: (license: LicenseView) => string,
  failure: string,
) {
  return async (
    _previous: LicenseActionState,
    formData: FormData,
  ): Promise<LicenseActionState> => {
    const ownerId = await requireDeveloperId();

    const parsed = licenseActionSchema.safeParse({ licenseId: formData.get("licenseId") });
    if (!parsed.success) return actionFailure("That license is no longer available.");

    let license: LicenseView;
    try {
      license = await run(ownerId, parsed.data.licenseId);
    } catch (error) {
      return actionFailure(safeErrorMessage(error, failure));
    }

    const productId = productIdSchema.safeParse(formData.get("productId"));
    if (productId.success) revalidateProduct(productId.data);

    return actionSuccess(describe(license), null);
  };
}

export const revokeLicenseAction = licenseMutation(
  (ownerId, licenseId) => revokeLicense(db, ownerId, licenseId),
  (license) => `Revoked ${licenseDisplayName(license)}.`,
  "Could not revoke that license.",
);

export const restoreLicenseAction = licenseMutation(
  (ownerId, licenseId) => restoreLicense(db, ownerId, licenseId),
  (license) => `Restored ${licenseDisplayName(license)}.`,
  "Could not restore that license.",
);

export const resetActivationAction = licenseMutation(
  (ownerId, licenseId) => resetActivation(db, ownerId, licenseId),
  (license) =>
    `Activation reset for ${licenseDisplayName(license)}. The next device can claim it.`,
  "Could not reset that activation.",
);

export const deleteLicenseAction = licenseMutation(
  (ownerId, licenseId) => deleteLicense(db, ownerId, licenseId),
  (license) => `Deleted ${licenseDisplayName(license)} permanently.`,
  "Could not delete that license.",
);

export async function updateLicenseDetailsAction(
  _previous: LicenseActionState,
  formData: FormData,
): Promise<LicenseActionState> {
  const ownerId = await requireDeveloperId();

  const parsed = editLicenseDetailsSchema.safeParse({
    licenseId: formData.get("licenseId"),
    label: formData.get("label"),
    notes: formData.get("notes"),
  });

  if (!parsed.success) {
    return actionFailure(firstIssueMessage(parsed.error), fieldErrorsFrom(parsed.error));
  }

  try {
    const license = await updateLicenseDetails(db, ownerId, parsed.data.licenseId, {
      label: parsed.data.label,
      notes: parsed.data.notes,
    });

    const productId = productIdSchema.safeParse(formData.get("productId"));
    if (productId.success) revalidateProduct(productId.data);

    return actionSuccess(`Saved details for ${licenseDisplayName(license)}.`, null);
  } catch (error) {
    return actionFailure(safeErrorMessage(error, "Could not save those details."));
  }
}
