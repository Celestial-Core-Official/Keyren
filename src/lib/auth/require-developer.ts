import { auth } from "@clerk/nextjs/server";

/**
 * The single source of the authenticated developer's ID.
 *
 * Every service call takes `ownerId` explicitly, and this is the only
 * function permitted to produce one. `ownerId` is never read from a form
 * field, a URL parameter, a header, or a request body — a browser can claim
 * anything, and Clerk's server-side session is the only thing that can prove
 * it.
 */
export async function requireDeveloperId(): Promise<string> {
  const { userId } = await auth();

  if (!userId) {
    // Middleware should already have redirected. Reaching here means a route
    // was not covered, so fail closed rather than continuing without an owner.
    throw new Error("Unauthorized");
  }

  return userId;
}
