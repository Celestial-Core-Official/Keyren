import Link from "next/link";
import { PackageX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/dashboard/empty-state";

/**
 * Shown for a product that does not exist AND for one belonging to another
 * developer — the two are indistinguishable on purpose, so a product ID
 * cannot be probed for existence. The wording therefore commits to neither.
 */
export default function ProductNotFound() {
  return (
    <EmptyState
      icon={<PackageX className="size-5" />}
      title="Product not found"
      description="This product does not exist, or it is not one of yours. Check the link, or pick a product from your list."
      action={
        <Button asChild size="sm">
          <Link href="/dashboard/products">Go to products</Link>
        </Button>
      }
    />
  );
}
