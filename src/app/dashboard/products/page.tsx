import Link from "next/link";
import { Package, SearchX } from "lucide-react";
import { db } from "@/db";
import { requireDeveloperId } from "@/lib/auth/require-developer";
import { listProducts } from "@/lib/products/service";
import { isProductFiltered } from "@/lib/products/types";
import { parseProductQuery, type RawSearchParams } from "@/lib/validation/dashboard";
import { EmptyState } from "@/components/dashboard/empty-state";
import { PageHeader } from "@/components/dashboard/page-header";
import { CopyButton } from "@/components/dashboard/copy-button";
import { RelativeTime } from "@/components/dashboard/relative-time";
import { CreateProductDialog } from "@/components/products/create-product-dialog";
import { ProductActions } from "@/components/products/product-actions";
import { ProductFilters } from "@/components/products/product-filters";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const ownerId = await requireDeveloperId();

  const query = parseProductQuery(await searchParams);
  const products = await listProducts(db, ownerId, query);

  const filtering = isProductFiltered(query);
  const empty = products.length === 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Products"
        description="Each product has a permanent ID that your software sends when verifying a license."
        action={<CreateProductDialog />}
      />

      {!empty || filtering ? <ProductFilters query={query} total={products.length} /> : null}

      {empty && filtering ? (
        <EmptyState
          icon={<SearchX className="size-5" />}
          title="No products match that search"
          description="Nothing here matches by name, slug or product ID. Try a different term."
        />
      ) : empty ? (
        <EmptyState
          icon={<Package className="size-5" />}
          title="No products yet"
          description="A product gives you a permanent product ID. Your software sends that ID with every license check, and it never changes — not even if you rename the product."
          action={<CreateProductDialog />}
        />
      ) : (
        <>
          {/* Desktop: a table. */}
          <div className="hidden overflow-x-auto rounded-lg border border-border md:block">
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
                  // `relative` so the stretched link below has something to
                  // position against; the cells that hold real controls get
                  // their own `relative` to sit above it.
                  <TableRow key={product.id} className="relative">
                    <TableCell className="max-w-64">
                      {/* The link stretches across the row via a pseudo
                          element, so the whole row is clickable without
                          nesting the copy button or the menu inside an anchor
                          — which would be invalid and would swallow their
                          clicks. */}
                      <Link
                        href={`/dashboard/products/${product.id}`}
                        className="font-medium after:absolute after:inset-0 after:content-[''] hover:underline"
                      >
                        <span className="block truncate">{product.name}</span>
                      </Link>
                      <p className="truncate text-xs text-muted-foreground">{product.slug}</p>
                    </TableCell>
                    <TableCell>
                      <div className="relative flex items-center gap-1">
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
                      <RelativeTime value={product.createdAt} />
                    </TableCell>
                    <TableCell>
                      <div className="relative">
                        <ProductActions productId={product.id} name={product.name} />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Narrow screens: cards, so the product ID can wrap and the menu
              stays reachable without horizontal scrolling. */}
          <ul className="space-y-3 md:hidden">
            {products.map((product) => (
              <li
                key={product.id}
                className="relative rounded-lg border border-border p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/dashboard/products/${product.id}`}
                      className="font-medium after:absolute after:inset-0 after:content-['']"
                    >
                      <span className="block truncate">{product.name}</span>
                    </Link>
                    <p className="truncate text-xs text-muted-foreground">{product.slug}</p>
                  </div>
                  <div className="relative shrink-0">
                    <ProductActions productId={product.id} name={product.name} />
                  </div>
                </div>

                <div className="relative mt-3 flex flex-wrap items-center gap-2">
                  <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs break-all">
                    {product.id}
                  </code>
                  <CopyButton value={product.id} label="" />
                </div>

                <p className="mt-2 text-xs text-muted-foreground">
                  {product.licenseCount} license{product.licenseCount === 1 ? "" : "s"} ·
                  created <RelativeTime value={product.createdAt} />
                </p>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
