"use server";

import { db } from "@/db";
import { requireDeveloperId } from "@/lib/auth/require-developer";
import { searchLicensesForOwner, type LicenseSearchHit } from "@/lib/licenses/query";

/**
 * Backs the command palette's license results.
 *
 * Ownership is resolved server-side from the session on every call — the
 * client sends a search term and nothing else, so there is no owner id in the
 * payload for anyone to change.
 */
export async function searchLicensesAction(term: string): Promise<LicenseSearchHit[]> {
  const ownerId = await requireDeveloperId();

  // A palette fires a request per keystroke; a term this short would match
  // most of the table and is not worth a round trip.
  if (term.trim().length < 2) return [];

  return searchLicensesForOwner(db, ownerId, term, 5);
}
