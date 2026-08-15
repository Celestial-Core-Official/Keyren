import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { DashboardSidebar } from "@/components/dashboard/sidebar";
import { Toaster } from "@/components/ui/sonner";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-background/95 px-4 backdrop-blur">
        <Link href="/dashboard" className="flex items-center gap-2">
          <span className="font-semibold tracking-tight">Keyren</span>
          <span className="rounded border border-border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Alpha_v1
          </span>
        </Link>
        <UserButton />
      </header>

      <div className="mx-auto flex max-w-7xl">
        <aside className="hidden w-56 shrink-0 border-r border-border md:block">
          <div className="sticky top-14">
            <DashboardSidebar />
          </div>
        </aside>
        <main className="min-w-0 flex-1 px-6 py-8">{children}</main>
      </div>

      <Toaster />
    </div>
  );
}
