import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { KeyboardShortcuts } from "@/components/dashboard/keyboard-shortcuts";
import { MobileNav } from "@/components/dashboard/mobile-nav";
import { DashboardSidebar } from "@/components/dashboard/sidebar";
import { Toaster } from "@/components/ui/sonner";
import { RELEASE } from "@/lib/release";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
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
            <span className="rounded border border-border px-1.5 py-0.5 text-[10px] font-medium tracking-wider text-muted-foreground">
              {RELEASE.name}
            </span>
          </Link>
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
