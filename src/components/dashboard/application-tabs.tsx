"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * The Overview / Licenses tabs inside an application.
 *
 * Alpha_v1 rendered both links identically, with no indication of which one
 * you were on and no `aria-current`, so the tabs told you where you could go
 * but not where you were.
 */
export function ApplicationTabs({ applicationId }: { applicationId: string }) {
  const pathname = usePathname();

  const base = `/dashboard/applications/${applicationId}`;

  const tabs = [
    { href: base, label: "Overview", exact: true },
    { href: `${base}/licenses`, label: "Licenses", exact: false },
    { href: `${base}/integrate`, label: "Integrate", exact: false },
    { href: `${base}/settings`, label: "Settings", exact: false },
  ];

  return (
    <nav
      className="-mb-px flex gap-1 overflow-x-auto"
      aria-label="Application sections"
    >
      {tabs.map((tab) => {
        const active = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);

        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              // The underline is an `after:` rule rather than a border, so an
              // inactive tab is not 2px shorter than an active one and moving
              // between them doesn't nudge the row.
              "relative flex h-9 items-center rounded-t-md px-3 text-[13px] transition-colors duration-[var(--speed-quick)] after:absolute after:inset-x-0 after:-bottom-px after:h-px after:transition-colors after:duration-[var(--speed-quick)]",
              active
                ? "font-medium text-foreground after:bg-primary"
                : "text-fg-tertiary after:bg-transparent hover:text-foreground hover:after:bg-border-strong",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
