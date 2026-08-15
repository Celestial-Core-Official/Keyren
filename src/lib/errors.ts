/**
 * The complete set of codes the public verification API may return.
 *
 * `BAD_REQUEST` extends the set named in the specification, which lists a
 * minimum ("including"); a malformed body needs a distinct code so an
 * integrating developer can tell a client bug from a rejected license.
 */
export type VerificationErrorCode =
  | "BAD_REQUEST"
  | "PRODUCT_INVALID"
  | "LICENSE_INVALID"
  | "LICENSE_REVOKED"
  | "LICENSE_EXPIRED"
  | "DEVICE_MISMATCH"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR";

/**
 * 400 the request was malformed, 404 the product does not exist, 403 the
 * request was well-formed but the license was rejected, 429 throttled,
 * 500 Keyren failed.
 */
export const VERIFICATION_ERROR_STATUS: Record<VerificationErrorCode, number> = {
  BAD_REQUEST: 400,
  PRODUCT_INVALID: 404,
  LICENSE_INVALID: 403,
  LICENSE_REVOKED: 403,
  LICENSE_EXPIRED: 403,
  DEVICE_MISMATCH: 403,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
};

/**
 * Fixed, public-safe messages. These are the only prose that ever leaves the
 * verification endpoint — no exception text, no SQL, no column names, no IDs.
 */
export const VERIFICATION_ERROR_MESSAGE: Record<VerificationErrorCode, string> = {
  BAD_REQUEST: "The request body was malformed.",
  PRODUCT_INVALID: "The provided product is invalid.",
  LICENSE_INVALID: "The provided license is invalid.",
  LICENSE_REVOKED: "This license has been revoked.",
  LICENSE_EXPIRED: "This license has expired.",
  DEVICE_MISMATCH: "This license is already active on another device.",
  RATE_LIMITED: "Too many requests. Try again shortly.",
  INTERNAL_ERROR: "An unexpected error occurred.",
};

/** Errors raised by dashboard services, distinct from the public API codes. */
export type DashboardErrorCode = "NOT_FOUND" | "INVALID_INPUT" | "CONFLICT";

export class KeyrenError extends Error {
  constructor(
    readonly code: DashboardErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "KeyrenError";
  }
}

/**
 * Returned when a resource is absent OR owned by someone else. Collapsing
 * those two cases into one is intentional: distinguishing them would let a
 * developer probe for the existence of another developer's resources.
 */
export function notFound(resource: string): KeyrenError {
  return new KeyrenError("NOT_FOUND", `${resource} not found.`);
}
