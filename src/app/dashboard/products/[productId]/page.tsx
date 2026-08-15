import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { env } from "@/env";
import { requireDeveloperId } from "@/lib/auth/require-developer";
import { getProduct } from "@/lib/products/service";
import { listLicenses } from "@/lib/licenses/service";
import { IntegrationSnippet } from "@/components/products/integration-snippet";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function ProductOverviewPage({
  params,
}: {
  params: Promise<{ productId: string }>;
}) {
  const { productId } = await params;
  const ownerId = await requireDeveloperId();

  const product = await getProduct(db, ownerId, productId);
  if (!product) notFound();

  const licenses = await listLicenses(db, ownerId, productId);
  const active = licenses.filter((license) => license.status === "active").length;
  const activated = licenses.filter((license) => license.activation !== null).length;

  return (
    <div className="space-y-8">
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: "Licenses", value: licenses.length },
          { label: "Active", value: active },
          { label: "Activated devices", value: activated },
        ].map((stat) => (
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

      <div className="flex justify-end">
        <Button asChild size="sm" variant="outline">
          <Link href={`/dashboard/products/${product.id}/licenses`}>Manage licenses</Link>
        </Button>
      </div>

      <IntegrationSnippet productId={product.id} appUrl={env.NEXT_PUBLIC_APP_URL} />
    </div>
  );
}
