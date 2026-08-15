import Link from "next/link";
import { db } from "@/db";
import { requireDeveloperId } from "@/lib/auth/require-developer";
import { listProducts } from "@/lib/products/service";
import { PageHeader } from "@/components/dashboard/page-header";
import { CopyButton } from "@/components/dashboard/copy-button";
import { CreateProductDialog } from "@/components/products/create-product-dialog";
import { ProductActions } from "@/components/products/product-actions";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default async function ProductsPage() {
  const ownerId = await requireDeveloperId();
  const products = await listProducts(db, ownerId);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Products"
        description="Each product has a permanent ID that your software sends when verifying a license."
        action={<CreateProductDialog />}
      />

      {products.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-sm font-medium">No products yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Create your first product to start issuing licenses.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Product ID</TableHead>
                <TableHead className="text-right">Licenses</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map((product) => (
                <TableRow key={product.id}>
                  <TableCell>
                    <Link
                      href={`/dashboard/products/${product.id}`}
                      className="font-medium hover:underline"
                    >
                      {product.name}
                    </Link>
                    <p className="text-xs text-muted-foreground">{product.slug}</p>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                        {product.id}
                      </code>
                      <CopyButton value={product.id} label="" />
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {product.licenseCount}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {product.createdAt.toISOString().slice(0, 10)}
                  </TableCell>
                  <TableCell>
                    <ProductActions productId={product.id} name={product.name} />
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
