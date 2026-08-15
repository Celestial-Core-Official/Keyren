import { Badge } from "@/components/ui/badge";
import { isExpired } from "@/lib/licenses/expiration";

export function LicenseStatusBadge({
  status,
  expiresAt,
}: {
  status: "active" | "revoked";
  expiresAt: Date | null;
}) {
  if (status === "revoked") return <Badge variant="destructive">Revoked</Badge>;

  // An active license past its expiry is shown as Expired: that is what the
  // verification API will actually tell the customer's software. Uses the
  // same isExpired() the verification engine itself uses (rather than a
  // fresh Date.now() comparison here) so there is exactly one definition of
  // "expired" in the whole app, and so this component's render stays a pure
  // function of its props rather than reading the clock directly.
  if (isExpired(expiresAt)) {
    return <Badge variant="secondary">Expired</Badge>;
  }

  return (
    <Badge className="border-emerald-500/25 bg-emerald-500/15 text-emerald-400" variant="outline">
      Active
    </Badge>
  );
}
