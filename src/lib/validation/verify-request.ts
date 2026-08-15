import { z } from "zod";

/**
 * The public verification request body.
 *
 * Bounded on every field: the endpoint is unauthenticated and reachable by
 * anyone, so an unbounded string is free CPU for an attacker to burn through
 * the HMAC. Unknown keys are stripped rather than passed through, so a client
 * cannot smuggle a field that some later refactor starts reading.
 *
 * Note what is NOT accepted: no owner ID, no product secret, no status
 * override, no expiry. The client supplies identifiers only; every decision
 * is made from server-held state.
 */
export const verifyRequestSchema = z
  .object({
    productId: z
      .string()
      .min(1)
      .max(64)
      .regex(/^prod_[0-9A-Za-z]+$/, "Invalid product id"),

    // Format is not enforced strictly here — normalization happens in the
    // crypto layer, and a wrong-format key must fail as LICENSE_INVALID
    // rather than as a validation error, so the two are indistinguishable
    // from outside.
    licenseKey: z.string().min(1).max(128),

    // An opaque client-computed fingerprint. Keyren never asks for raw
    // hardware details, and never interprets this value.
    deviceId: z.string().min(1).max(1024),
  })
  .strip();

export type VerifyRequestBody = z.infer<typeof verifyRequestSchema>;
