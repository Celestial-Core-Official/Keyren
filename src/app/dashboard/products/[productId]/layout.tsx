import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { db } from "@/db";
import { requireDeveloperId } from "@/lib/auth/require-developer";
import { getCachedProduct } from "@/lib/products/cached";
import { CopyButton } from "@/components/dashboard/copy-button";
import { ProductTabs } from "@/components/dashboard/product-tabs";

export default async function ProductLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ productId: string }>;
}) {
  const { productId } = await params;
  const ownerId = await requireDeveloperId();

  // Scoped by owner. A product belonging to another developer resolves to
  // null and renders the same 404 as one that does not exist.
  //
  // Cached per request, so the page beneath this layout can make the same
  // call — and make its own ownership check rather than trusting this one —
  // without a second round trip to the database.
  const product = await getCachedProduct(db, ownerId, productId);
  if (!product) notFound();

  return (
    <div className="space-y-8">
      {/* The identity block is one compact row: a long product name and a
          product ID used to cost four stacked lines of vertical space before
          any actual content appeared. */}
      <div className="space-y-3 border-b border-border">
        <Link
          href="/dashboard/products"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-4" />
          Products
        </Link>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h1 className="min-w-0 text-xl font-semibold tracking-tight break-words">
            {product.name}
          </h1>
          <div className="flex items-center gap-1">
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
              {product.id}
            </code>
            <CopyButton value={product.id} label="" />
          </div>
        </div>

        <ProductTabs productId={product.id} />
      </div>

      {children}
    </div>
  );
}
