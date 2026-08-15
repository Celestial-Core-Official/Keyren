"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { requireDeveloperId } from "@/lib/auth/require-developer";
import { createProduct, deleteProduct, renameProduct } from "@/lib/products/service";
import { createProductSchema, productIdSchema, renameProductSchema } from "@/lib/validation/dashboard";

/**
 * Server actions are thin: authenticate, validate, delegate.
 *
 * Every one of them re-derives `ownerId` from Clerk. A server action is a
 * public HTTP endpoint with a generated name — it is not protected by the
 * fact that only the dashboard UI calls it, so it re-authorizes from scratch.
 */

export type ActionState = { error: string } | { error: null };

export async function createProductAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ownerId = await requireDeveloperId();

  const parsed = createProductSchema.safeParse({ name: formData.get("name") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const product = await createProduct(db, ownerId, { name: parsed.data.name });

  revalidatePath("/dashboard/products");
  redirect(`/dashboard/products/${product.id}`);
}

export async function renameProductAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ownerId = await requireDeveloperId();

  const parsed = renameProductSchema.safeParse({
    productId: formData.get("productId"),
    name: formData.get("name"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  try {
    await renameProduct(db, ownerId, parsed.data.productId, parsed.data.name);
  } catch {
    // Includes the "belongs to another developer" case, reported identically.
    return { error: "Product not found." };
  }

  revalidatePath("/dashboard/products");
  revalidatePath(`/dashboard/products/${parsed.data.productId}`);
  return { error: null };
}

export async function deleteProductAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ownerId = await requireDeveloperId();

  const parsed = productIdSchema.safeParse(formData.get("productId"));
  if (!parsed.success) return { error: "Invalid product." };

  try {
    await deleteProduct(db, ownerId, parsed.data);
  } catch {
    return { error: "Product not found." };
  }

  revalidatePath("/dashboard/products");
  redirect("/dashboard/products");
}
