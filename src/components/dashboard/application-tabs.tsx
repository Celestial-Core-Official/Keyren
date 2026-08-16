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

  const tabs = [
    { href: `/dashboard/applications/${applicationId}`, label: "Overview", exact: true },
    {
      href: `/dashboard/applications/${applicationId}/licenses`,
      label: "Licenses",
      exact: false,
    },
  ];

  return (
    <nav className="-mb-px flex gap-1" aria-label="Application sections">
      {tabs.map((tab) => {
        const active = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);

        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-t-md border-b-2 px-3 py-2 text-sm transition-colors",
              active
                ? "border-primary font-medium text-foreground"
                : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
