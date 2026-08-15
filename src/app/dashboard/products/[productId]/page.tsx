import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { env } from "@/env";
import { requireDeveloperId } from "@/lib/auth/require-developer";
import { getCachedProduct } from "@/lib/products/cached";
import { getProductLicenseStats } from "@/lib/licenses/query";
import { verifyUrl } from "@/lib/release";
import { CopyButton } from "@/components/dashboard/copy-button";
import { ApiTester } from "@/components/products/api-tester";
import { IntegrationCenter } from "@/components/products/integration-center";
import { OnboardingChecklist } from "@/components/products/onboarding-checklist";
import { CreateLicenseDialog } from "@/components/licenses/create-license-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function ProductOverviewPage({
  params,
}: {
  params: Promise<{ productId: string }>;
}) {
  const { productId } = await params;
  const ownerId = await requireDeveloperId();

  const product = await getCachedProduct(db, ownerId, productId);
  if (!product) notFound();

  // One aggregate query rather than loading every license to count them.
  const stats = await getProductLicenseStats(db, ownerId, productId);

  // Expired and revoked are only shown when they exist: a column of zeroes
  // teaches the developer to stop reading the row.
  const cards = [
    { label: "Licenses", value: stats.total, always: true },
    { label: "Active", value: stats.active, always: true },
    { label: "Bound devices", value: stats.boundDevices, always: true },
    { label: "Expired", value: stats.expired, always: false },
    { label: "Revoked", value: stats.revoked, always: false },
  ].filter((card) => card.always || card.value > 0);

  return (
    <div className="space-y-8">
      <OnboardingChecklist
        productId={product.id}
        productSlug={product.slug}
        hasLicense={stats.total > 0}
        // Derived, not remembered: an activation row is only ever written by
        // a verification that succeeded.
        hasVerification={stats.activated > 0}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        {cards.map((stat) => (
          <Card key={stat.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-semibold tabular-nums">{stat.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Endpoint</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1.5 font-mono text-xs">
              {verifyUrl(env.NEXT_PUBLIC_APP_URL)}
            </code>
            <CopyButton
              value={verifyUrl(env.NEXT_PUBLIC_APP_URL)}
              label="Copy endpoint"
              variant="outline"
              className="h-8"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1.5 font-mono text-xs">
              {product.id}
            </code>
            <CopyButton
              value={product.id}
              label="Copy product ID"
              variant="outline"
              className="h-8"
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <CreateLicenseDialog
          productId={product.id}
          productSlug={product.slug}
          variant="outline"
        />
        <Button asChild size="sm">
          <Link href={`/dashboard/products/${product.id}/licenses`}>Manage licenses</Link>
        </Button>
      </div>

      <div id="integration" className="scroll-mt-20">
        <IntegrationCenter productId={product.id} appUrl={env.NEXT_PUBLIC_APP_URL} />
      </div>

      <ApiTester productId={product.id} />
    </div>
  );
}
