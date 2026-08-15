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
import { createProduct, deleteProduct, renameProduct } from "@/lib/products/service";
import {
  createProductSchema,
  productIdSchema,
  renameProductSchema,
} from "@/lib/validation/dashboard";

/**
 * Server actions are thin: authenticate, validate, delegate.
 *
 * Every one of them re-derives `ownerId` from Clerk. A server action is a
 * public HTTP endpoint with a generated name — it is not protected by the
 * fact that only the dashboard UI calls it, so it re-authorizes from scratch.
 */

export type ProductActionState = ActionState<null>;

export async function createProductAction(
  _previous: ProductActionState,
  formData: FormData,
): Promise<ProductActionState> {
  const ownerId = await requireDeveloperId();

  const parsed = createProductSchema.safeParse({ name: formData.get("name") });
  if (!parsed.success) {
    return actionFailure(firstIssueMessage(parsed.error), fieldErrorsFrom(parsed.error));
  }

  const product = await createProduct(db, ownerId, { name: parsed.data.name });

  revalidatePath("/dashboard/products");
  revalidatePath("/dashboard");
  // Straight to the new product rather than back to the list: the developer
  // created it in order to do something with it, and the next step — generate
  // a license, copy the integration — is there.
  redirect(`/dashboard/products/${product.id}`);
}

export async function renameProductAction(
  _previous: ProductActionState,
  formData: FormData,
): Promise<ProductActionState> {
  const ownerId = await requireDeveloperId();

  const parsed = renameProductSchema.safeParse({
    productId: formData.get("productId"),
    name: formData.get("name"),
  });
  if (!parsed.success) {
    return actionFailure(firstIssueMessage(parsed.error), fieldErrorsFrom(parsed.error));
  }

  try {
    await renameProduct(db, ownerId, parsed.data.productId, parsed.data.name);
  } catch (error) {
    // Includes the "belongs to another developer" case, reported identically.
    return actionFailure(safeErrorMessage(error, "Could not rename that product."));
  }

  revalidatePath("/dashboard/products");
  revalidatePath(`/dashboard/products/${parsed.data.productId}`);
  return actionSuccess(`Renamed to ${parsed.data.name}.`, null);
}

export async function deleteProductAction(
  _previous: ProductActionState,
  formData: FormData,
): Promise<ProductActionState> {
  const ownerId = await requireDeveloperId();

  const parsed = productIdSchema.safeParse(formData.get("productId"));
  if (!parsed.success) return actionFailure("That product is no longer available.");

  try {
    await deleteProduct(db, ownerId, parsed.data);
  } catch (error) {
    return actionFailure(safeErrorMessage(error, "Could not delete that product."));
  }

  revalidatePath("/dashboard/products");
  revalidatePath("/dashboard");
  redirect("/dashboard/products");
}
