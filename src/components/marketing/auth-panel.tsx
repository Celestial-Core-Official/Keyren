import Link from "next/link";
import { BrandMark, Wordmark } from "@/components/marketing/brand-mark";
import { RELEASE } from "@/lib/release";

/**
 * The shell both auth routes share.
 *
 * Form on the left at a fixed measure, and on the right a panel carrying the
 * hairline grid and one true statement about the product. Below `lg` the panel
 * is dropped rather than stacked — a decorative column above a sign-in form is
 * just something to scroll past on a phone.
 */
export function AuthLayout({
  children,
  statement,
}: {
  children: React.ReactNode;
  statement: string;
}) {
  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <div className="flex flex-col px-6 py-8">
        <Link href="/" className="inline-flex w-fit items-center gap-2.5">
          <Wordmark />
          <span className="rounded-sm border border-border px-1.5 py-0.5 font-mono text-[10px] text-fg-quaternary">
            {RELEASE.name}
          </span>
        </Link>

        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-[400px]">{children}</div>
        </div>
      </div>

      <div className="relative hidden overflow-hidden border-l border-border bg-surface-1 lg:block">
        <div
          className="texture-grid absolute inset-0"
          style={{
            maskImage: "radial-gradient(70% 60% at 50% 40%, #000 0%, transparent 100%)",
            WebkitMaskImage: "radial-gradient(70% 60% at 50% 40%, #000 0%, transparent 100%)",
          }}
          aria-hidden="true"
        />
        <div className="relative flex h-full flex-col justify-center px-14">
          <BrandMark className="size-9 text-primary" />
          <p className="mt-8 max-w-[26ch] text-[22px] font-medium leading-snug tracking-[var(--tracking-heading)]">
            {statement}
          </p>
        </div>
      </div>
    </main>
  );
}
