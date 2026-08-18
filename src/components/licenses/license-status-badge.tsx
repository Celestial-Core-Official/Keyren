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

  // A filled badge is reserved for the one state that has to interrupt the
  // reader. Everything else is a dot plus a label, which takes a page from
  // roughly twenty-five coloured rectangles down to twenty-five two-pixel
  // dots — the difference between a list that scans and a list that shouts.
  //
  // Colour is never the only signal: every state ships its own word.
  if (resolved === "revoked") return <Badge variant="destructive">Revoked</Badge>;

  const tone = resolved === "expired" ? "bg-warning" : "bg-success";
  const label = resolved === "expired" ? "Expired" : "Active";

  return (
    <span className="inline-flex items-center gap-1.5 text-[13px] whitespace-nowrap">
      <span className={`size-1.5 shrink-0 rounded-full ${tone}`} aria-hidden="true" />
      {label}
    </span>
  );
}
