import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { SIGN_IN_URL, SIGN_UP_URL } from "@/lib/auth/routes";
import {
  CURRENT_APPLICATION_COOKIE,
  applicationIdFromPath,
} from "@/lib/applications/current";

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

export default clerkMiddleware(
  async (auth, request) => {
    if (isProtectedRoute(request)) {
      await auth.protect();
    }

    // Every route into an application passes through here — the chooser, the
    // command palette, a bookmark, a pasted link, and the redirect that follows
    // creating one. A server action called from the chooser would catch only
    // the first of those, which is why this lives in middleware and not there.
    //
    // The cookie this writes is not visible to `cookies()` on this same
    // request, and does not need to be: the client components read the
    // application out of the path they are already rendering, and the path
    // outranks the cookie anyway. This is for the next request, the one that
    // has left the application behind.
    const applicationId = applicationIdFromPath(request.nextUrl.pathname);
    if (applicationId === null) return;
    if (request.cookies.get(CURRENT_APPLICATION_COOKIE)?.value === applicationId) return;

    // A `<Link>` sitting in the viewport, or merely hovered, fires this same
    // request before anyone has clicked anything — Next's router tags it with
    // one of these headers depending on which prefetch path it took. Treating a
    // real visit as a prefetch by mistake only costs one skipped write: the URL
    // still wins for that render, and the next ordinary request into the
    // application writes the cookie anyway. Treating a prefetch as a real visit
    // is the actual bug — nothing downstream corrects it, and the header ends
    // up naming an application nobody chose. So on any doubt, this treats the
    // request as a prefetch.
    if (
      request.headers.get("next-router-prefetch") ||
      request.headers.get("next-router-segment-prefetch")
    ) {
      return;
    }

    const response = NextResponse.next();
    response.cookies.set(CURRENT_APPLICATION_COOKIE, applicationId, {
      httpOnly: true,
      sameSite: "lax",
      // Not `env.ts`: that module eagerly validates its whole schema
      // (DATABASE_URL, the license secret, Clerk's key) at import, which would
      // run on the Edge runtime on every dashboard request for one build-time flag.
      secure: process.env.NODE_ENV === "production",
      path: "/dashboard",
      maxAge: 60 * 60 * 24 * 365,
    });
    return response;
  },
  {
    // Without these, `auth.protect()` falls through to `redirectToSignIn()`,
    // which defaults to Clerk's hosted account portal on an accounts.dev
    // domain — sending a signed-out developer off Keyren entirely, past the
    // `/sign-in` page this app ships and links to from its own landing page.
    //
    // That page is also the only one `ThemedClerkProvider` can theme, so the
    // portal was permanently light-mode Clerk branding for an app that is dark
    // by default.
    signInUrl: SIGN_IN_URL,
    signUpUrl: SIGN_UP_URL,
  },
);

export const config = {
  matcher: [
    // Skip static files and Next internals, run on everything else.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
