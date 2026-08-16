import { and, eq } from "drizzle-orm";
import { activations, licenses, applications } from "@/db/schema";
import type { Database } from "@/db/types";
import { generateActivationId } from "@/lib/crypto/ids";
import { hashDeviceId } from "@/lib/crypto/device";
import { hashLicenseKey, keyHashesEqual } from "@/lib/crypto/license-key";
import {
  VERIFICATION_ERROR_MESSAGE,
  type VerificationErrorCode,
} from "@/lib/errors";
import { isExpired } from "./expiration";

export type VerifyInput = {
  applicationId: string;
  licenseKey: string;
  deviceId: string;
  secret: string;
  /** Injectable for deterministic expiry tests. */
  now?: Date;
};

export type VerifyResult =
  | { success: true; license: { status: "active"; expiresAt: string | null } }
  | { success: false; error: { code: VerificationErrorCode; message: string } };

function failure(code: VerificationErrorCode): VerifyResult {
  return { success: false, error: { code, message: VERIFICATION_ERROR_MESSAGE[code] } };
}

/**
 * Decides whether a running instance of a customer's software is licensed.
 *
 * Order of operations matters and follows the specification exactly:
 * locate application, derive lookup value, locate license, check state, check
 * expiration, check device rules, then bind or refresh the activation.
 *
 * Rate limiting happens upstream in the route handler, before this function
 * is called, so a flood of invalid keys never reaches the database.
 *
 * Every rejection returns a fixed, non-descriptive message. Nothing about
 * internal IDs, ownership, or which check failed beyond the normalized code
 * ever crosses the boundary.
 */
export async function verifyLicense(db: Database, input: VerifyInput): Promise<VerifyResult> {
  const now = input.now ?? new Date();

  // 1. Locate the application. Application IDs are shipped inside customer software
  //    and are not secret, so distinguishing this case is safe and helps a
  //    developer debug a bad integration.
  const [application] = await db
    .select({ id: applications.id })
    .from(applications)
    .where(eq(applications.id, input.applicationId))
    .limit(1);

  if (!application) return failure("APPLICATION_INVALID");

  // 2. Derive the lookup value. The plaintext key never touches the database
  //    and is never logged.
  const keyHash = hashLicenseKey(input.licenseKey, input.secret);

  // 3. Locate the license *within this application*. Scoping the lookup by
  //    application_id in the WHERE clause is what makes a key issued for one
  //    application useless against another. Index: licenses_application_key_hash_idx.
  const [license] = await db
    .select()
    .from(licenses)
    .where(and(eq(licenses.applicationId, application.id), eq(licenses.keyHash, keyHash)))
    .limit(1);

  // A missing license and a license belonging to a different application are
  // indistinguishable from out here, by design.
  if (!license) return failure("LICENSE_INVALID");

  // Defense in depth: re-check the digest in constant time. The indexed
  // equality above already matched, so this only matters if a future change
  // loosens that query.
  if (!keyHashesEqual(license.keyHash, keyHash)) return failure("LICENSE_INVALID");

  // 4. State before expiry: a revoked license reports as revoked even if it
  //    also happens to have lapsed, because revocation is the developer's
  //    deliberate act and is the more useful signal.
  if (license.status === "revoked") return failure("LICENSE_REVOKED");

  // 5. Expiration, compared in UTC against the server clock. The client's
  //    clock is untrusted and is never consulted.
  if (isExpired(license.expiresAt, now)) return failure("LICENSE_EXPIRED");

  // 6. Device rules and activation bookkeeping.
  const deviceHash = hashDeviceId(input.deviceId, input.secret);
  const bound = await bindOrRefreshActivation(db, license.id, deviceHash, license.hwidLocked, now);
  if (!bound) return failure("DEVICE_MISMATCH");

  return {
    success: true,
    license: {
      status: "active",
      expiresAt: license.expiresAt ? license.expiresAt.toISOString() : null,
    },
  };
}

/**
 * Returns false only when an HWID-locked license is already bound to a
 * different device.
 *
 * For a license that is NOT HWID-locked, the activation row still exists and
 * still tracks the most recently seen device — it records last-seen activity
 * rather than an exclusive claim, and never causes a rejection.
 */
async function bindOrRefreshActivation(
  db: Database,
  licenseId: string,
  deviceHash: string,
  hwidLocked: boolean,
  now: Date,
): Promise<boolean> {
  const [existing] = await db
    .select()
    .from(activations)
    .where(eq(activations.licenseId, licenseId))
    .limit(1);

  if (!existing) {
    // First successful authentication claims the license for this device.
    // The unique index on license_id makes a concurrent double-claim fail at
    // the database rather than silently creating two bindings; treat that
    // conflict as a mismatch, since the other request won the race.
    try {
      await db.insert(activations).values({
        id: generateActivationId(),
        licenseId,
        deviceHash,
        activatedAt: now,
        lastSeenAt: now,
      });
      return true;
    } catch {
      return !hwidLocked;
    }
  }

  const sameDevice = existing.deviceHash === deviceHash;

  if (hwidLocked && !sameDevice) return false;

  await db
    .update(activations)
    .set({
      lastSeenAt: now,
      // An unlocked license simply follows whichever device checked in last.
      ...(sameDevice ? {} : { deviceHash, activatedAt: now }),
    })
    .where(eq(activations.licenseId, licenseId));

  return true;
}
