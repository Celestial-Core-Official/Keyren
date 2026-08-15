import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { requireDeveloperId } from "@/lib/auth/require-developer";
import { getCachedProduct } from "@/lib/products/cached";
import { CopyButton } from "@/components/dashboard/copy-button";

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
      <div className="space-y-4 border-b border-border pb-6">
        <Link
          href="/dashboard/products"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Products
        </Link>

        <div className="space-y-2">
          <h1 className="text-xl font-semibold tracking-tight">{product.name}</h1>
          <div className="flex items-center gap-1">
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
              {product.id}
            </code>
            <CopyButton value={product.id} label="" />
          </div>
        </div>

        <nav className="flex gap-1" aria-label="Product sections">
          <Link
            href={`/dashboard/products/${product.id}`}
            className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent/50 hover:text-foreground"
          >
            Overview
          </Link>
          <Link
            href={`/dashboard/products/${product.id}/licenses`}
            className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent/50 hover:text-foreground"
          >
            Licenses
          </Link>
        </nav>
      </div>

      {children}
    </div>
  );
}
