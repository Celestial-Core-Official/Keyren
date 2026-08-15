import Link from "next/link";
import { db } from "@/db";
import { requireDeveloperId } from "@/lib/auth/require-developer";
import { listProducts } from "@/lib/products/service";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function OverviewPage() {
  const ownerId = await requireDeveloperId();
  const products = await listProducts(db, ownerId);

  const totalLicenses = products.reduce((sum, product) => sum + product.licenseCount, 0);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Overview"
        description="Your licensing footprint at a glance."
        action={
          <Button asChild size="sm">
            <Link href="/dashboard/products">Manage products</Link>
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Products
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold tabular-nums">{products.length}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Licenses
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold tabular-nums">{totalLicenses}</p>
          </CardContent>
        </Card>
      </div>

      {products.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-start gap-3 py-8">
            <div className="space-y-1">
              <p className="text-sm font-medium">No products yet</p>
              <p className="text-sm text-muted-foreground">
                Create a product to get a product ID and start issuing licenses.
              </p>
            </div>
            <Button asChild size="sm">
              <Link href="/dashboard/products">Create a product</Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
