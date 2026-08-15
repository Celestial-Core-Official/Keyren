import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

/**
 * Everything under /dashboard requires an authenticated developer.
 *
 * The public verification API is deliberately NOT matched: customer software
 * authenticates with a license key, not a Clerk session, and must never be
 * redirected to a sign-in page. The two authentication systems are entirely
 * separate and share no state.
 *
 * Middleware is a convenience, not the security boundary. Every server action
 * and query independently re-derives the owner from `auth()` and scopes its
 * SQL — a middleware misconfiguration alone cannot expose another
 * developer's data.
 */
const isProtectedRoute = createRouteMatcher(["/dashboard(.*)"]);

export default clerkMiddleware(async (auth, request) => {
  if (isProtectedRoute(request)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    // Skip static files and Next internals, run on everything else.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
