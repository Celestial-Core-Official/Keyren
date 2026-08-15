/**
 * A single axis a request can be limited on.
 *
 * Alpha_v1 checks IP and product. The shape allows more axes — a license
 * lookup fingerprint, a request-pattern signature — to be added later
 * without changing the interface or the call site in the route handler.
 *
 * The spec is explicit that a single naive IP limit is not enough: shared
 * networks put many legitimate users behind one address, and an attacker can
 * rotate addresses. Combining axes is the point of this shape.
 */
export type RateLimitDimension = {
  /** Axis name, e.g. "ip" or "product". Namespaces the bucket key. */
  name: string;
  /** The value on that axis, e.g. the address or the product ID. */
  value: string;
  /** Requests permitted per window. */
  limit: number;
  /** Window length in seconds. */
  windowSeconds: number;
};

export type RateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

export interface RateLimiter {
  /**
   * Consumes one unit against every dimension. Denies if ANY dimension is
   * over its limit.
   */
  consume(dimensions: RateLimitDimension[]): Promise<RateLimitResult>;
}
