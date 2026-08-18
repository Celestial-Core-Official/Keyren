"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { KeyRound, LayoutGrid, Menu, Package, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { SwitchableApplication } from "@/components/dashboard/application-switcher";
import { applicationIdFromPath } from "@/lib/applications/current";
import { cn } from "@/lib/utils";

const PRIMARY = [
  { href: "/dashboard", label: "Overview", icon: LayoutGrid, exact: true },
  { href: "/dashboard/applications", label: "Applications", icon: Package, exact: false },
  { href: "/dashboard/settings", label: "Settings", icon: Settings, exact: true },
] as const;

/**
 * Navigation for screens too narrow for the sidebar.
 *
 * Built on Radix's Dialog rather than a hand-rolled drawer, which brings the
 * focus trap, the Escape handling and — the part usually forgotten — focus
 * restoration back to the trigger on close.
 */
export function MobileNav({
  applications,
  fallbackId,
}: {
  applications: readonly SwitchableApplication[];
  fallbackId: string | null;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Closes on navigation — including a back gesture, not only a tap on a link
  // in here. Without it the panel stays over the page the developer just
  // asked for, which reads as the tap not having worked.
  //
  // Adjusted during render rather than in an effect: React documents this as
  // the way to reset state when a value changes, and it avoids the extra
  // commit-then-effect pass that would let the old page show through first.
  const [lastPathname, setLastPathname] = useState(pathname);
  if (pathname !== lastPathname) {
    setLastPathname(pathname);
    setOpen(false);
  }

  // Always in scope now, so the panel names it rather than leaving the reader
  // to infer which application these two links belong to.
  const applicationId = applicationIdFromPath(pathname) ?? fallbackId;
  const application = applications.find((candidate) => candidate.id === applicationId) ?? null;

  function isActive(href: string, exact: boolean): boolean {
    return exact ? pathname === href : pathname.startsWith(href);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          // 44px: the smallest target that is comfortable on a touch screen.
          className="size-11 md:hidden"
          aria-label="Open navigation"
        >
          <Menu className="size-5" />
        </Button>
      </DialogTrigger>

      <DialogContent className="top-0 left-0 max-w-72 translate-x-0 translate-y-0 rounded-none border-y-0 border-l-0 p-0 sm:max-w-72 [&>button]:top-4 [&>button]:right-4">
        <DialogHeader className="border-b border-border px-4 py-4">
          <DialogTitle className="text-base">Menu</DialogTitle>
        </DialogHeader>

        <nav aria-label="Dashboard" className="flex flex-col gap-1 p-3">
          {PRIMARY.map((item) => {
            const active = isActive(item.href, item.exact);
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-11 items-center gap-2.5 rounded-md px-3 text-sm transition-colors",
                  active
                    ? "bg-accent font-medium text-foreground"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                )}
              >
                <Icon className="size-4" />
                {item.label}
              </Link>
            );
          })}

          {applicationId ? (
            <>
              <p className="mt-4 px-3 pb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {application?.name ?? "This application"}
              </p>

              <Link
                href={`/dashboard/applications/${applicationId}`}
                aria-current={
                  pathname === `/dashboard/applications/${applicationId}` ? "page" : undefined
                }
                className={cn(
                  "flex min-h-11 items-center gap-2.5 rounded-md px-3 text-sm transition-colors",
                  pathname === `/dashboard/applications/${applicationId}`
                    ? "bg-accent font-medium text-foreground"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                )}
              >
                <LayoutGrid className="size-4" />
                Overview
              </Link>

              <Link
                href={`/dashboard/applications/${applicationId}/licenses`}
                aria-current={
                  pathname.startsWith(`/dashboard/applications/${applicationId}/licenses`)
                    ? "page"
                    : undefined
                }
                className={cn(
                  "flex min-h-11 items-center gap-2.5 rounded-md px-3 text-sm transition-colors",
                  pathname.startsWith(`/dashboard/applications/${applicationId}/licenses`)
                    ? "bg-accent font-medium text-foreground"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                )}
              >
                <KeyRound className="size-4" />
                Licenses
              </Link>
            </>
          ) : null}
        </nav>
      </DialogContent>
    </Dialog>
  );
}
