import Link from "next/link";
import { PackageX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/dashboard/empty-state";

/**
 * Shown for an application that does not exist AND for one belonging to another
 * developer — the two are indistinguishable on purpose, so an application ID
 * cannot be probed for existence. The wording therefore commits to neither.
 */
export default function ApplicationNotFound() {
  return (
    <EmptyState
      icon={<PackageX className="size-5" />}
      title="Application not found"
      description="This application does not exist, or it is not one of yours. Check the link, or pick an application from your list."
      action={
        <Button asChild size="sm">
          <Link href="/dashboard/applications">Go to applications</Link>
        </Button>
      }
    />
  );
}
