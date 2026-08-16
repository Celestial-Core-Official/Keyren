"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { requireDeveloperId } from "@/lib/auth/require-developer";
import {
  actionFailure,
  actionSuccess,
  firstIssueMessage,
  safeErrorMessage,
  type ActionState,
} from "@/lib/actions/state";
import {
  bulkDeleteLicenses,
  bulkResetActivations,
  bulkRestoreLicenses,
  bulkRevokeLicenses,
  licensesForExport,
  type BulkResult,
} from "@/lib/licenses/bulk";
import { metadataToJson, type MetadataJsonRow } from "@/lib/licenses/export";
import {
  bulkLicenseActionSchema,
  applicationIdSchema,
  licenseIdSchema,
  type BulkAction,
} from "@/lib/validation/dashboard";

/**
 * Bulk mutations, kept out of the single-license action file because they
 * have a different shape: they report counts rather than naming one license,
 * and they have to describe a partial outcome honestly.
 */

export type BulkActionState = ActionState<BulkResult | null>;
export type ExportSelectionState = ActionState<{ rows: MetadataJsonRow[] } | null>;

const RUNNERS: Record<
  BulkAction,
  (ownerId: string, ids: string[]) => Promise<BulkResult>
> = {
  revoke: (ownerId, ids) => bulkRevokeLicenses(db, ownerId, ids),
  restore: (ownerId, ids) => bulkRestoreLicenses(db, ownerId, ids),
  reset: (ownerId, ids) => bulkResetActivations(db, ownerId, ids),
  delete: (ownerId, ids) => bulkDeleteLicenses(db, ownerId, ids),
};

const VERBS: Record<BulkAction, { done: string; nothing: string }> = {
  revoke: { done: "Revoked", nothing: "Nothing to revoke" },
  restore: { done: "Restored", nothing: "Nothing to restore" },
  reset: { done: "Reset activation for", nothing: "Nothing to reset" },
  delete: { done: "Deleted", nothing: "Nothing to delete" },
};

/**
 * Describes what actually happened, including the parts that did not.
 *
 * "Revoked 5 licenses" when three were already revoked is a lie the developer
 * will act on. Skipped and unavailable counts are surfaced in the same
 * sentence — and "unavailable" deliberately covers both "no longer exists"
 * and "belongs to someone else", which the service does not distinguish.
 */
function describe(action: BulkAction, result: BulkResult): string {
  const { done, nothing } = VERBS[action];
  const parts: string[] = [];

  if (result.changed === 0) {
    parts.push(nothing);
  } else {
    parts.push(`${done} ${result.changed} license${result.changed === 1 ? "" : "s"}`);
  }

  if (result.skipped > 0) parts.push(`${result.skipped} already in that state`);
  if (result.notFound > 0) parts.push(`${result.notFound} no longer available`);

  return `${parts.join(" — ")}.`;
}

function parseSelection(formData: FormData) {
  return bulkLicenseActionSchema.safeParse({
    applicationId: formData.get("applicationId"),
    action: formData.get("action"),
    licenseIds: formData.getAll("licenseIds"),
  });
}

export async function bulkLicenseAction(
  _previous: BulkActionState,
  formData: FormData,
): Promise<BulkActionState> {
  const ownerId = await requireDeveloperId();

  const parsed = parseSelection(formData);
  if (!parsed.success) return actionFailure(firstIssueMessage(parsed.error));

  try {
    const result = await RUNNERS[parsed.data.action](ownerId, parsed.data.licenseIds);

    revalidatePath(`/dashboard/applications/${parsed.data.applicationId}/licenses`);
    revalidatePath(`/dashboard/applications/${parsed.data.applicationId}`);

    return actionSuccess(describe(parsed.data.action, result), result);
  } catch (error) {
    return actionFailure(safeErrorMessage(error, "Could not complete that action."));
  }
}

/**
 * Returns metadata for the selection so the browser can build the file.
 *
 * The rows come back in the action result rather than from a download route,
 * which keeps the ownership check on the same path as every other read and
 * means there is no URL that serves license data to whoever holds it.
 *
 * `MetadataJsonRow` has no field capable of carrying a plaintext key. That is
 * the difference between this export and the batch one: this can run over any
 * stored record at any time, so it must be structurally incapable of
 * revealing a key rather than merely careful not to.
 */
export async function exportSelectionAction(
  _previous: ExportSelectionState,
  formData: FormData,
): Promise<ExportSelectionState> {
  const ownerId = await requireDeveloperId();

  const applicationId = applicationIdSchema.safeParse(formData.get("applicationId"));
  if (!applicationId.success) return actionFailure("That application is no longer available.");

  const ids = wellFormedLicenseIds(formData.getAll("licenseIds"));
  if (ids.length === 0) return actionFailure("Select at least one license to export.");

  try {
    const rows = await licensesForExport(db, ownerId, ids);
    if (rows.length === 0) {
      return actionFailure("None of the selected licenses are still available.");
    }

    return actionSuccess(
      `Prepared ${rows.length} license${rows.length === 1 ? "" : "s"} for export.`,
      { rows: metadataToJson(rows) },
    );
  } catch (error) {
    return actionFailure(safeErrorMessage(error, "Could not prepare that export."));
  }
}

/** Keeps only well-formed license ids; anything else was not ours to read. */
function wellFormedLicenseIds(values: FormDataEntryValue[]): string[] {
  return values
    .map((value) => licenseIdSchema.safeParse(value))
    .filter((parsed) => parsed.success)
    .map((parsed) => parsed.data);
}
