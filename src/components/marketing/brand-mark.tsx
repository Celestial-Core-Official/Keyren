import { cn } from "@/lib/utils";

/**
 * The Keyren mark, theme-aware.
 *
 * `public/logo.svg` is the master artwork and stays as it is — but it carries
 * a filled `#161618` rectangle behind the path and a hardcoded `#4244CE`
 * stroke, which makes it a dark-mode-only asset: on a light page it is a
 * near-black square. This is the same path drawn with `currentColor`, so the
 * mark inherits whatever it sits in.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 800 800"
      fill="none"
      className={cn("size-5", className)}
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M666.333 433.682C666.333 502.544 646.417 557.181 613.261 601C566.17 663.236 492.373 703.652 411 732.015C403.739 734.476 395.851 734.358 388.667 731.682M411 732.015C271.5 503.5 546.304 387.661 633 167.015M666.333 433.682V200.348C666.333 191.508 662.821 183.029 656.57 176.778C650.319 170.527 641.841 167.015 633 167.015M666.333 433.682C470.424 314.374 193.097 372.305 166.333 167.015M323.5 113.94C341.709 102.531 358.916 89.8164 374.333 76.3483C381.395 70.3149 390.378 67 399.667 67C408.955 67 417.938 70.3149 425 76.3483C483.333 127.348 566.333 167.015 633 167.015M425 76.3483C436.674 111.895 447.059 145.282 456.131 176.778M166.333 167.015C157.493 167.015 149.014 170.527 142.763 176.778C136.512 183.029 133 191.508 133 200.348V433.682M166.333 167.015C215.279 167.015 273.208 145.454 323.5 113.94M388.667 731.682C338.362 714.31 290.983 692.311 251 663.409C180.503 612.45 133 540.031 133 433.682M133 433.682C177.896 405.222 238.057 413.055 323.5 448.722M388.667 731.682C515.595 574.244 532.86 443.171 456.131 176.778M613.261 601C492.743 532.65 398.406 479.99 323.5 448.722M251 663.409C201.287 434.427 214.62 313.647 323.5 113.94M323.5 448.722C344.039 302.961 372.332 242.474 456.131 176.778"
        stroke="currentColor"
        strokeWidth={52}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Mark plus wordmark. The wordmark is set in the display face at the heading
 * tracking rather than left at `normal` — a logotype sitting at default
 * letter-spacing is the detail that makes a header look untouched.
 */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2", className)}>
      <BrandMark className="size-5 text-primary" />
      <span className="text-[15px] font-semibold tracking-[var(--tracking-heading)]">Keyren</span>
    </span>
  );
}
