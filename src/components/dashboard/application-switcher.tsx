"use client";

import { useRouter, usePathname } from "next/navigation";
import { Check, ChevronsUpDown, Plus, PowerOff } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { applicationIdFromPath } from "@/lib/applications/current";
import { cn } from "@/lib/utils";

export type SwitchableApplication = {
  id: string;
  name: string;
  disabled: boolean;
};

/**
 * Picks which application the whole dashboard is looking at.
 *
 * There is always one. Through Alpha_v3 this control read "All applications"
 * on every page whose path did not name one, which made the dashboard's
 * subject a thing you could be outside of; the lists were the real choosers
 * and this was a shortcut. That is now inverted — this is the only way to pick
 * an application, so it may never be empty.
 *
 * Identity comes from two places, in order. The path, when it names an
 * application: a URL you are looking at outranks anything remembered. Then
 * `fallbackId`, resolved on the server from the cookie and then the newest
 * application. The path half is applied here rather than upstream because
 * `usePathname()` is a client hook and the layout that resolves the other half
 * is a server component with no pathname of its own.
 *
 * The important behaviour on switch is that you stay on the section you were
 * reading. Switching from A's licenses goes to B's licenses, not to B's
 * overview. Implemented by rewriting one path segment rather than by storing a
 * selection, so a switched-to view is still bookmarkable and still survives a
 * refresh.
 */
export function ApplicationSwitcher({
  applications,
  fallbackId,
}: {
  applications: readonly SwitchableApplication[];
  /**
   * The application to treat as current when the path does not name one.
   * Resolved server-side: the `keyren_app` cookie, then the newest
   * application, then `null` for a developer who owns none.
   */
  fallbackId: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();

  const inPath = applicationIdFromPath(pathname);
  const currentId = inPath ?? fallbackId;
  const current = applications.find((application) => application.id === currentId) ?? null;

  // Only a path that actually names an application has a section to preserve.
  // From /dashboard there is nothing to carry across, and a switch lands on
  // the application's overview.
  const suffix = inPath === null ? "" : pathname.slice(`/dashboard/applications/${inPath}`.length);

  function switchTo(id: string) {
    router.push(`/dashboard/applications/${id}${suffix}`);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "flex min-w-0 items-center gap-1.5 rounded-md px-2 py-1.5 text-sm transition-colors",
          "hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
          current ? "text-foreground" : "text-muted-foreground",
        )}
        aria-label={
          current
            ? `Current application: ${current.name}. Switch application`
            : "No applications yet. Create one"
        }
      >
        <span className="truncate">{current?.name ?? "No applications"}</span>
        {current?.disabled ? (
          <PowerOff className="size-3.5 shrink-0 text-destructive" aria-label="Disabled" />
        ) : null}
        <ChevronsUpDown className="size-3.5 shrink-0 opacity-60" />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-56">
        {applications.length > 0 ? (
          <>
            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
              Applications
            </DropdownMenuLabel>
            {applications.map((application) => (
              <DropdownMenuItem
                key={application.id}
                onSelect={() => switchTo(application.id)}
                className="justify-between gap-2"
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="truncate">{application.name}</span>
                  {application.disabled ? (
                    <PowerOff className="size-3 shrink-0 text-destructive" aria-label="Disabled" />
                  ) : null}
                </span>
                {application.id === currentId ? (
                  <Check className="size-3.5 shrink-0" />
                ) : null}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
          </>
        ) : null}

        <DropdownMenuItem onSelect={() => router.push("/dashboard/applications?new=1")}>
          <Plus className="size-4" />
          New application
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
