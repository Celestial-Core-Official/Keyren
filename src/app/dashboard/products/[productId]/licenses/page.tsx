import { notFound } from "next/navigation";
import { db } from "@/db";
import { requireDeveloperId } from "@/lib/auth/require-developer";
import { getProduct } from "@/lib/products/service";
import { listLicenses } from "@/lib/licenses/service";
import { maskedLicenseKey } from "@/lib/crypto/license-key";
import { CreateLicenseDialog } from "@/components/licenses/create-license-dialog";
import { LicenseRowActions } from "@/components/licenses/license-row-actions";
import { LicenseStatusBadge } from "@/components/licenses/license-status-badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function formatDate(value: Date | null): string {
  return value ? value.toISOString().slice(0, 10) : "—";
}

export default async function LicensesPage({
  params,
}: {
  params: Promise<{ productId: string }>;
}) {
  const { productId } = await params;
  const ownerId = await requireDeveloperId();

  const product = await getProduct(db, ownerId, productId);
  if (!product) notFound();

  const licenses = await listLicenses(db, ownerId, productId);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-medium">Licenses</h2>
          <p className="text-sm text-muted-foreground">
            Keys are shown once at creation and cannot be retrieved afterwards.
          </p>
        </div>
        <CreateLicenseDialog productId={product.id} />
      </div>

      {licenses.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-sm font-medium">No licenses yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Generate one to start authenticating installations of {product.name}.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>License</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Device lock</TableHead>
                <TableHead>Activation</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>

            <TableBody>
              {licenses.map((license) => (
                <TableRow key={license.id}>
                  <TableCell>
                    <code className="font-mono text-xs text-muted-foreground">
                      {maskedLicenseKey(license.keyLast4)}
                    </code>
                  </TableCell>

                  <TableCell>
                    <LicenseStatusBadge
                      status={license.status}
                      expiresAt={license.expiresAt}
                    />
                  </TableCell>

                  <TableCell className="text-sm text-muted-foreground">
                    {license.hwidLocked ? "Locked" : "Unlocked"}
                  </TableCell>

                  <TableCell className="text-sm text-muted-foreground">
                    {license.activation
                      ? `Last seen ${formatDate(license.activation.lastSeenAt)}`
                      : "Not activated"}
                  </TableCell>

                  <TableCell className="text-sm text-muted-foreground">
                    {license.expiresAt ? formatDate(license.expiresAt) : "Never"}
                  </TableCell>

                  <TableCell className="text-sm text-muted-foreground">
                    {formatDate(license.createdAt)}
                  </TableCell>

                  <TableCell>
                    <LicenseRowActions
                      licenseId={license.id}
                      productId={product.id}
                      status={license.status}
                      hasActivation={license.activation !== null}
                      maskedKey={maskedLicenseKey(license.keyLast4)}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
