/**
 * Where Keyren's own authentication screens live.
 *
 * Shared between the middleware and the Clerk provider because they configure
 * two different halves of the same journey and must not drift: the middleware
 * decides where a signed-out request to `/dashboard` is sent, while the
 * provider decides where Clerk's own components link. Configured in one of the
 * two and the developer is redirected to Keyren's sign-in page and then
 * offered a "sign up" link back to Clerk's hosted portal, or the reverse.
 *
 * These must stay in step with the catch-all route segments in `src/app`
 * (`sign-in/[[...sign-in]]`, `sign-up/[[...sign-up]]`) — Clerk mounts a
 * multi-step flow at these paths, which is why they are catch-alls.
 */
export const SIGN_IN_URL = "/sign-in";
export const SIGN_UP_URL = "/sign-up";
