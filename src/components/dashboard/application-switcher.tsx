"use client";

import { useRouter, usePathname } from "next/navigation";
import { Check, ChevronsUpDown, Plus, Layers, PowerOff } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export type SwitchableApplication = {
  id: string;
  name: string;
  disabled: boolean;
};

/**
 * Picks which application the whole dashboard is looking at.
 *
 * The important behaviour is what happens on switch: you stay on the section
 * you were already reading. Switching from A's licenses goes to B's licenses,
 * not to B's overview and not back to a list. Choosing an application is meant
 * to feel like changing the subject of every tab at once, which is the whole
 * reason this sits in the header rather than being a row you click in a table.
 *
 * Implemented by rewriting one path segment rather than by storing a
 * "current application" anywhere. The URL stays the single source of truth, so
 * a switched-to view is still bookmarkable, still shareable, and still
 * survives a refresh — none of which is true of a selection kept in storage.
 */
export function ApplicationSwitcher({
  applications,
}: {
  applications: readonly SwitchableApplication[];
}) {
  const router = useRouter();
  const pathname = usePathname();

  // Read from the URL rather than taken as a prop: the dashboard layout sits
  // above the [applicationId] segment and never receives it as a param, and
  // threading it down through every page would put the same value in two
  // places that could disagree.
  const match = pathname.match(/^\/dashboard\/applications\/([^/]+)(.*)$/);
  const currentId = match?.[1];
  const currentSuffix = match?.[2] ?? "";

  const current = applications.find((application) => application.id === currentId);

  function switchTo(id: string) {
    // The section you were reading — /licenses, or nothing for the overview —
    // carries across, so switching changes the subject rather than the place.
    router.push(`/dashboard/applications/${id}${currentSuffix}`);
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
          current ? `Current application: ${current.name}. Switch application` : "Choose an application"
        }
      >
        <span className="truncate">{current?.name ?? "All applications"}</span>
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

        <DropdownMenuItem onSelect={() => router.push("/dashboard/applications")}>
          <Layers className="size-4" />
          All applications
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => router.push("/dashboard/applications?new=1")}>
          <Plus className="size-4" />
          New application
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
