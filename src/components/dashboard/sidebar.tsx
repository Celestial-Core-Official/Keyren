"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Code2, KeyRound, LayoutGrid, Package, Settings, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/dashboard", label: "Overview", icon: LayoutGrid, exact: true },
  { href: "/dashboard/applications", label: "Applications", icon: Package, exact: false },
  { href: "/dashboard/settings", label: "Settings", icon: Settings, exact: true },
] as const;

/**
 * The tabs that already exist under an application title, mirrored into the
 * sidebar when you are inside one.
 *
 * Not a replacement for the tabs — the same destination reachable from two
 * places is how a shell stops feeling like a stack of unrelated pages, and on
 * a wide display the sidebar is where the eye looks for depth.
 */
const APPLICATION_NAV = [
  { segment: "", label: "Overview", icon: LayoutGrid },
  { segment: "/licenses", label: "Licenses", icon: KeyRound },
  { segment: "/integrate", label: "Integrate", icon: Code2 },
  { segment: "/settings", label: "Settings", icon: SlidersHorizontal },
] as const;

const SECTION =
  "px-2.5 pt-4 pb-1.5 text-[11px] font-medium uppercase tracking-[var(--tracking-label)] text-fg-quaternary";

const ROW =
  "flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13px] transition-colors duration-[var(--speed-quick)]";

/** Matches /dashboard/applications/<id>, capturing the id and nothing deeper. */
const APPLICATION_PATH = /^\/dashboard\/applications\/([^/]+)/;

export function DashboardSidebar() {
  const pathname = usePathname();
  const applicationId = APPLICATION_PATH.exec(pathname)?.[1];

  function rowClass(active: boolean) {
    return cn(
      ROW,
      active
        ? "bg-accent font-medium text-foreground [&_svg]:opacity-100"
        : "text-fg-tertiary hover:bg-accent/60 hover:text-foreground",
    );
  }

  return (
    <nav className="flex flex-col gap-0.5 p-3" aria-label="Dashboard">
      <p className={SECTION}>Workspace</p>

      {NAV.map((item) => {
        const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
        const Icon = item.icon;

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={rowClass(active)}
          >
            {/* Icons sit at 70% until their row is active. At full strength a
                column of glyphs competes with the labels it is supposed to be
                supporting. */}
            <Icon className="size-4 shrink-0 opacity-70" />
            {item.label}
          </Link>
        );
      })}

      {applicationId ? (
        <>
          <p className={SECTION}>Application</p>
          {APPLICATION_NAV.map((item) => {
            const href = `/dashboard/applications/${applicationId}${item.segment}`;
            const active = pathname === href;
            const Icon = item.icon;

            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={rowClass(active)}
              >
                <Icon className="size-4 shrink-0 opacity-70" />
                {item.label}
              </Link>
            );
          })}
        </>
      ) : null}
    </nav>
  );
}
