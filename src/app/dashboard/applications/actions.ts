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
import {
  createApplication,
  deleteApplication,
  renameApplication,
  setApplicationDisabled,
} from "@/lib/applications/service";
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
  // Reachable only when the form arrived without a well-formed application id,
  // which is a bug in the page rather than a missing application. Saying "no
  // longer available" sent the reader to look for a deletion that never
  // happened.
  if (!parsed.success) {
    return actionFailure("That submission arrived without an application. Reload and try again.");
  }

  try {
    await deleteApplication(db, ownerId, parsed.data);
  } catch (error) {
    return actionFailure(safeErrorMessage(error, "Could not delete that application."));
  }

  revalidatePath("/dashboard/applications");
  revalidatePath("/dashboard");
  redirect("/dashboard/applications");
}

/**
 * Switches an application off, or back on.
 *
 * Nothing is destroyed either way — no license is revoked and no activation is
 * released — so this is safe to toggle and safe to toggle back. While off, the
 * verification endpoint rejects every license the application owns with
 * APPLICATION_DISABLED.
 */
export async function setApplicationDisabledAction(
  _previous: ApplicationActionState,
  formData: FormData,
): Promise<ApplicationActionState> {
  const ownerId = await requireDeveloperId();

  const parsed = applicationIdSchema.safeParse(formData.get("applicationId"));
  // Reachable only when the form arrived without a well-formed application id,
  // which is a bug in the page rather than a missing application. Saying "no
  // longer available" sent the reader to look for a deletion that never
  // happened.
  if (!parsed.success) {
    return actionFailure("That submission arrived without an application. Reload and try again.");
  }

  // The form states the intended end state rather than asking the server to
  // flip whatever it finds. Two tabs open on the same application then agree
  // on the result instead of racing to opposite answers.
  const disabled = formData.get("disabled") === "true";

  try {
    await setApplicationDisabled(db, ownerId, parsed.data, disabled);
  } catch (error) {
    return actionFailure(
      safeErrorMessage(error, "Could not change that application's status."),
    );
  }

  revalidatePath("/dashboard/applications");
  revalidatePath(`/dashboard/applications/${parsed.data}`);
  revalidatePath("/dashboard");

  return actionSuccess(
    disabled
      ? "Application disabled. License checks will now be rejected."
      : "Application enabled. License checks will succeed again.",
    null,
  );
}
