import Link from "next/link";
import { Package } from "lucide-react";
import { db } from "@/db";
import { requireDeveloperId } from "@/lib/auth/require-developer";
import { listProducts } from "@/lib/products/service";
import { EmptyState } from "@/components/dashboard/empty-state";
import { PageHeader } from "@/components/dashboard/page-header";
import { CreateProductDialog } from "@/components/products/create-product-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function OverviewPage() {
  const ownerId = await requireDeveloperId();
  const products = await listProducts(db, ownerId);

  const totalLicenses = products.reduce((sum, product) => sum + product.licenseCount, 0);
  const empty = products.length === 0;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Overview"
        description="Your licensing footprint at a glance."
        action={
          empty ? null : (
            <Button asChild size="sm">
              <Link href="/dashboard/products">Manage products</Link>
            </Button>
          )
        }
      />

      {empty ? (
        // The first thing a new account sees. One action, and it opens the
        // creation dialog directly — Alpha_v1 linked to the products page and
        // left the developer to find the button again once they arrived.
        <EmptyState
          icon={<Package className="size-5" />}
          title="Create your first product"
          description="A product gives you a permanent product ID. Your software sends that ID with every license check, and it never changes — not even if you rename the product."
          action={<CreateProductDialog />}
        />
      ) : (
        <>
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

          {totalLicenses === 0 ? (
            <EmptyState
              title="No licenses issued yet"
              description="Open a product to generate your first license and copy an integration example."
              action={
                <Button asChild size="sm">
                  <Link href={`/dashboard/products/${products[0]!.id}`}>
                    Open {products[0]!.name}
                  </Link>
                </Button>
              }
            />
          ) : null}
        </>
      )}
    </div>
  );
}
