import { CopyButton } from "@/components/dashboard/copy-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function IntegrationSnippet({
  productId,
  appUrl,
}: {
  productId: string;
  appUrl: string;
}) {
  const snippet = `const response = await fetch("${appUrl}/api/v1/licenses/verify", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    productId: "${productId}",
    licenseKey: "KEYREN-...",
    deviceId: "your-device-fingerprint",
  }),
});

const result = await response.json();

if (!result.success) {
  throw new Error(result.error.code);
}

// result.license.status   -> "active"
// result.license.expiresAt -> ISO string, or null for a permanent license`;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Integration</CardTitle>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="relative">
          <div className="absolute right-2 top-2">
            <CopyButton value={snippet} />
          </div>
          <pre className="overflow-x-auto rounded-lg border border-border bg-muted/40 p-4 text-xs leading-relaxed">
            <code>{snippet}</code>
          </pre>
        </div>

        <div className="space-y-3 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">Before you ship this</p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              The product ID above is not a secret and is safe to embed in software you
              distribute. It is an identifier, not a credential.
            </li>
            <li>
              Never ship any Keyren dashboard credential, session token, or the license
              HMAC secret inside end-user software. Anything in a distributed binary or a
              JavaScript bundle should be assumed readable by anyone who has it.
            </li>
            <li>
              Send a fingerprint you have already computed and hashed on the client.
              Do not send raw hardware serials.
            </li>
            <li>
              Treat a device fingerprint as an identifier, not as tamper-proof hardware
              identity. It raises the cost of casual key sharing; it does not make
              spoofing impossible.
            </li>
            <li>
              Verification is online-only in this release. If Keyren is unreachable your
              software cannot obtain a positive response — decide deliberately how your
              application should behave in that case.
            </li>
            <li>
              Handle every error code:{" "}
              <code className="font-mono text-xs">LICENSE_INVALID</code>,{" "}
              <code className="font-mono text-xs">LICENSE_REVOKED</code>,{" "}
              <code className="font-mono text-xs">LICENSE_EXPIRED</code>,{" "}
              <code className="font-mono text-xs">DEVICE_MISMATCH</code>,{" "}
              <code className="font-mono text-xs">PRODUCT_INVALID</code>,{" "}
              <code className="font-mono text-xs">RATE_LIMITED</code>,{" "}
              <code className="font-mono text-xs">INTERNAL_ERROR</code>,{" "}
              <code className="font-mono text-xs">BAD_REQUEST</code>.
            </li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
