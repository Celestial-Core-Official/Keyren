import Link from "next/link";
import { Show } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { Wordmark } from "@/components/marketing/brand-mark";
import { RELEASE, VERIFY_PATH } from "@/lib/release";

/** One line, one button. A second CTA here would be hedging. */
export function ClosingCta() {
  return (
    <section className="border-b border-border">
      <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-6 px-6 py-16">
        <h2 className="max-w-[24ch] text-[clamp(1.5rem,2.6vw,2rem)] font-medium leading-tight tracking-[var(--tracking-heading)]">
          Issue your first licence key in the next five minutes.
        </h2>
        <Show when="signed-out">
          <Button asChild size="lg">
            <Link href="/sign-up">Create an account</Link>
          </Button>
        </Show>
        <Show when="signed-in">
          <Button asChild size="lg">
            <Link href="/dashboard">Open dashboard</Link>
          </Button>
        </Show>
      </div>
    </section>
  );
}

export function SiteFooter() {
  return (
    <footer className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-4 px-6 py-10">
      <Wordmark className="text-fg-tertiary" />
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-[12px] text-fg-quaternary">
        <span>{RELEASE.name}</span>
        <span>{VERIFY_PATH}</span>
        <Link href="/sign-in" className="transition-colors duration-[var(--speed-quick)] hover:text-fg-secondary">
          Sign in
        </Link>
      </div>
    </footer>
  );
}
