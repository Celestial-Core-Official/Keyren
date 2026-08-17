import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Show } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { HeroProduct } from "@/components/marketing/hero-product";
import { VERIFY_PATH } from "@/lib/release";

export function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-border">
      {/* Structure, not decoration. A hairline dot grid says "technical
          surface"; a blurred gradient blob says nothing and is the fastest
          read of "template". Masked so it fades rather than stopping at an
          edge. */}
      <div
        className="texture-grid pointer-events-none absolute inset-0"
        style={{
          maskImage: "radial-gradient(80% 60% at 50% 0%, #000 0%, transparent 100%)",
          WebkitMaskImage: "radial-gradient(80% 60% at 50% 0%, #000 0%, transparent 100%)",
        }}
        aria-hidden="true"
      />

      <div className="relative mx-auto grid max-w-[1200px] items-center gap-14 px-6 py-20 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-16 lg:py-28">
        <div className="motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-500 motion-safe:fill-mode-both motion-safe:ease-[var(--ease-out-expo)]">
          {/* The eyebrow is the actual endpoint. An all-caps label is only
              filler when it names nothing; this one is the product. */}
          <p className="font-mono text-[12px] text-fg-quaternary">{VERIFY_PATH}</p>

          <h1 className="mt-5 max-w-[13ch] text-[clamp(2.5rem,5.2vw,3.9rem)] font-medium leading-[1.02] tracking-[var(--tracking-display)]">
            Stop building a licensing backend.
          </h1>

          <p className="mt-6 max-w-[46ch] text-[17px] leading-relaxed text-fg-secondary">
            Key generation, device binding, expiry and revocation behind one endpoint you
            don&rsquo;t have to run.
          </p>

          <div className="mt-9 flex flex-wrap items-center gap-3">
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
            {/* Anchors to the section below. There is no docs site yet, and a
                link that 404s is worse than no link. */}
            <Button asChild size="lg" variant="ghost">
              <a href="#integration" className="group">
                See the API
                <ArrowRight className="transition-transform duration-[var(--speed-quick)] group-hover:translate-x-0.5" />
              </a>
            </Button>
          </div>
        </div>

        <div className="motion-safe:animate-in motion-safe:fade-in motion-safe:duration-700 motion-safe:fill-mode-both lg:-mr-20 xl:-mr-32">
          <HeroProduct />
        </div>
      </div>
    </section>
  );
}
