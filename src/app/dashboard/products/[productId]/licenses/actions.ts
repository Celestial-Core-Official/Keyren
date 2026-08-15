"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { env } from "@/env";
import { requireDeveloperId } from "@/lib/auth/require-developer";
import {
  createLicense,
  deleteLicense,
  resetActivation,
  restoreLicense,
  revokeLicense,
} from "@/lib/licenses/service";
import type { ExpirationInput } from "@/lib/licenses/expiration";
import { createLicenseSchema, licenseActionSchema } from "@/lib/validation/dashboard";

export type LicenseActionState = { error: string | null };

/**
 * The ONLY code path in Keyren that returns a plaintext license key.
 *
 * The key travels: generator -> this response -> the creation dialog. It is
 * never written to the database, never logged, and never returned by any
 * list or detail endpoint. Once the dialog is dismissed it is unrecoverable,
 * which is why the dialog demands an explicit acknowledgement.
 *
 * The first variant is the `useActionState` seed value only — before any
 * submission there is neither an error nor a key yet. `createLicenseAction`
 * itself only ever returns the second or third variant.
 */
export type CreateLicenseState =
  | { error: null; plaintextKey: null }
  | { error: string; plaintextKey: null }
  | { error: null; plaintextKey: string };

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
    // An unchecked box submits nothing at all, so absence must mean locked.
    hwidLocked: formData.get("hwidLocked") !== "off",
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input", plaintextKey: null };
  }

  const expiration: ExpirationInput =
    parsed.data.mode === "permanent"
      ? { mode: "permanent" }
      : parsed.data.mode === "date"
        ? { mode: "date", expiresAt: parsed.data.expiresAt }
        : { mode: "duration", duration: parsed.data.duration };

  try {
    const { plaintextKey } = await createLicense(db, ownerId, {
      productId: parsed.data.productId,
      expiration,
      hwidLocked: parsed.data.hwidLocked,
      secret: env.KEYREN_LICENSE_HMAC_SECRET,
    });

    revalidatePath(`/dashboard/products/${parsed.data.productId}/licenses`);
    return { error: null, plaintextKey };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not create license.";
    return { error: message, plaintextKey: null };
  }
}

/** Shared shape for the four single-license mutations. */
function licenseMutation(
  run: (ownerId: string, licenseId: string) => Promise<unknown>,
) {
  return async (
    _previous: LicenseActionState,
    formData: FormData,
  ): Promise<LicenseActionState> => {
    const ownerId = await requireDeveloperId();

    const parsed = licenseActionSchema.safeParse({ licenseId: formData.get("licenseId") });
    if (!parsed.success) return { error: "Invalid license." };

    const productId = formData.get("productId");

    try {
      await run(ownerId, parsed.data.licenseId);
    } catch {
      return { error: "License not found." };
    }

    if (typeof productId === "string") {
      revalidatePath(`/dashboard/products/${productId}/licenses`);
    }
    return { error: null };
  };
}

export const revokeLicenseAction = licenseMutation((ownerId, licenseId) =>
  revokeLicense(db, ownerId, licenseId),
);

export const restoreLicenseAction = licenseMutation((ownerId, licenseId) =>
  restoreLicense(db, ownerId, licenseId),
);

export const resetActivationAction = licenseMutation((ownerId, licenseId) =>
  resetActivation(db, ownerId, licenseId),
);

export const deleteLicenseAction = licenseMutation((ownerId, licenseId) =>
  deleteLicense(db, ownerId, licenseId),
);
