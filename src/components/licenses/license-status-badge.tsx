import { Badge } from "@/components/ui/badge";
import { isExpired } from "@/lib/licenses/expiration";
import type { EffectiveStatus } from "@/lib/licenses/types";

/**
 * The status a customer's software would actually be told.
 *
 * `effectiveStatus` is preferred when the caller has it, because it came from
 * the same SQL expression the status filter uses — so filtering to "expired"
 * and the badge on the row can never disagree. The fallback recomputes it
 * with the same `isExpired` the verification engine uses, so a caller that
 * only has a raw row still gets the same answer.
 */
export function LicenseStatusBadge({
  status,
  expiresAt,
  effectiveStatus,
}: {
  status: "active" | "revoked";
  expiresAt: Date | null;
  effectiveStatus?: EffectiveStatus;
}) {
  const resolved: EffectiveStatus =
    effectiveStatus ??
    (status === "revoked" ? "revoked" : isExpired(expiresAt) ? "expired" : "active");

  if (resolved === "revoked") return <Badge variant="destructive">Revoked</Badge>;

  if (resolved === "expired") {
    return (
      <Badge className="border-amber-500/25 bg-amber-500/15 text-amber-400" variant="outline">
        Expired
      </Badge>
    );
  }

  return (
    <Badge className="border-emerald-500/25 bg-emerald-500/15 text-emerald-400" variant="outline">
      Active
    </Badge>
  );
}
