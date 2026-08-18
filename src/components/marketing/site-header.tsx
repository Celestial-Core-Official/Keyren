import Link from "next/link";
import { Show } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { Wordmark } from "@/components/marketing/brand-mark";
import { RELEASE } from "@/lib/release";

/**
 * Backdrop blur is chrome, never content. This is the only element on the
 * marketing page that uses it.
 */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-[20px]">
      <div className="mx-auto flex h-14 max-w-[1200px] items-center justify-between gap-4 px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <Wordmark />
          <span className="hidden rounded-sm border border-border px-1.5 py-0.5 font-mono text-[10px] text-fg-quaternary sm:inline">
            {RELEASE.name}
          </span>
        </Link>

        <div className="flex items-center gap-1">
          <Show when="signed-out">
            <Button asChild variant="ghost" size="sm">
              <Link href="/sign-in">Sign in</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/sign-up">Get started</Link>
            </Button>
          </Show>
          <Show when="signed-in">
            <Button asChild size="sm">
              <Link href="/dashboard">Dashboard</Link>
            </Button>
          </Show>
        </div>
      </div>
    </header>
  );
}
