import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { db } from "@/db";
import { requireDeveloperId } from "@/lib/auth/require-developer";
import { listApplications } from "@/lib/applications/service";
import { ApplicationSwitcher } from "@/components/dashboard/application-switcher";
import { KeyboardShortcuts } from "@/components/dashboard/keyboard-shortcuts";
import { MobileNav } from "@/components/dashboard/mobile-nav";
import { DashboardSidebar } from "@/components/dashboard/sidebar";
import { Toaster } from "@/components/ui/sonner";
import { RELEASE } from "@/lib/release";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const ownerId = await requireDeveloperId();

  // Owner-scoped, and only the two fields the switcher renders. The list is
  // small by nature — one developer's own applications — so this costs a
  // single indexed query on a layout that was already hitting auth.
  const applications = (await listApplications(db, ownerId)).map((application) => ({
    id: application.id,
    name: application.name,
  }));

  return (
    <div className="min-h-screen">
      {/* Skip link: the first tab stop on every page, so a keyboard user is
          not obliged to walk the whole navigation to reach the content. */}
      <a
        href="#dashboard-content"
        className="sr-only rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-2 border-b border-border bg-background/95 px-2 backdrop-blur sm:px-4">
        <div className="flex min-w-0 items-center gap-1">
          <MobileNav />
          <Link href="/dashboard" className="flex items-center gap-2 px-2">
            <span className="font-semibold tracking-tight">Keyren</span>
            <span className="hidden rounded border border-border px-1.5 py-0.5 text-[10px] font-medium tracking-wider text-muted-foreground sm:inline">
              {RELEASE.name}
            </span>
          </Link>
          <span className="text-muted-foreground/40" aria-hidden="true">
            /
          </span>
          <ApplicationSwitcher applications={applications} />
        </div>
        <UserButton />
      </header>

      <div className="mx-auto flex max-w-7xl">
        <aside className="hidden w-56 shrink-0 border-r border-border md:block">
          <div className="sticky top-14">
            <DashboardSidebar />
          </div>
        </aside>
        <main id="dashboard-content" className="min-w-0 flex-1 px-4 py-8 sm:px-6">
          {children}
        </main>
      </div>

      <KeyboardShortcuts />
      <Toaster />
    </div>
  );
}
