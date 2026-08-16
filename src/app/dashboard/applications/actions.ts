"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { requireDeveloperId } from "@/lib/auth/require-developer";
import {
  actionFailure,
  actionSuccess,
  fieldErrorsFrom,
  firstIssueMessage,
  safeErrorMessage,
  type ActionState,
} from "@/lib/actions/state";
import { createApplication, deleteApplication, renameApplication } from "@/lib/applications/service";
import {
  createApplicationSchema,
  applicationIdSchema,
  renameApplicationSchema,
} from "@/lib/validation/dashboard";

/**
 * Server actions are thin: authenticate, validate, delegate.
 *
 * Every one of them re-derives `ownerId` from Clerk. A server action is a
 * public HTTP endpoint with a generated name — it is not protected by the
 * fact that only the dashboard UI calls it, so it re-authorizes from scratch.
 */

export type ApplicationActionState = ActionState<null>;

export async function createApplicationAction(
  _previous: ApplicationActionState,
  formData: FormData,
): Promise<ApplicationActionState> {
  const ownerId = await requireDeveloperId();

  const parsed = createApplicationSchema.safeParse({ name: formData.get("name") });
  if (!parsed.success) {
    return actionFailure(firstIssueMessage(parsed.error), fieldErrorsFrom(parsed.error));
  }

  const application = await createApplication(db, ownerId, { name: parsed.data.name });

  revalidatePath("/dashboard/applications");
  revalidatePath("/dashboard");
  // Straight to the new application rather than back to the list: the developer
  // created it in order to do something with it, and the next step — generate
  // a license, copy the integration — is there.
  redirect(`/dashboard/applications/${application.id}`);
}

export async function renameApplicationAction(
  _previous: ApplicationActionState,
  formData: FormData,
): Promise<ApplicationActionState> {
  const ownerId = await requireDeveloperId();

  const parsed = renameApplicationSchema.safeParse({
    applicationId: formData.get("applicationId"),
    name: formData.get("name"),
  });
  if (!parsed.success) {
    return actionFailure(firstIssueMessage(parsed.error), fieldErrorsFrom(parsed.error));
  }

  try {
    await renameApplication(db, ownerId, parsed.data.applicationId, parsed.data.name);
  } catch (error) {
    // Includes the "belongs to another developer" case, reported identically.
    return actionFailure(safeErrorMessage(error, "Could not rename that application."));
  }

  revalidatePath("/dashboard/applications");
  revalidatePath(`/dashboard/applications/${parsed.data.applicationId}`);
  return actionSuccess(`Renamed to ${parsed.data.name}.`, null);
}

export async function deleteApplicationAction(
  _previous: ApplicationActionState,
  formData: FormData,
): Promise<ApplicationActionState> {
  const ownerId = await requireDeveloperId();

  const parsed = applicationIdSchema.safeParse(formData.get("applicationId"));
  if (!parsed.success) return actionFailure("That application is no longer available.");

  try {
    await deleteApplication(db, ownerId, parsed.data);
  } catch (error) {
    return actionFailure(safeErrorMessage(error, "Could not delete that application."));
  }

  revalidatePath("/dashboard/applications");
  revalidatePath("/dashboard");
  redirect("/dashboard/applications");
}
