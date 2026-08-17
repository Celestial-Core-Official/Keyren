import { KeyGlyph } from "@/lib/design/key-glyph";
import { middleTruncate } from "@/lib/design/truncate";

/**
 * The product, rendered.
 *
 * Not a screenshot and not an abstract illustration — this is real DOM built
 * from the same tokens and the same `KeyGlyph` the dashboard uses, so it stays
 * sharp at any density, themes correctly, and cannot drift out of date the way
 * a captured image does.
 *
 * That choice is the whole argument of this fold: roughly nine in ten
 * developer-tool sites show an abstract visual here, and developers read that
 * as a product the company is not confident enough to show.
 */
const ROWS = [
  { key: "KEYREN-7F2A4C81-9B3E-D05A-C1E9", label: "Studio Pro — annual", status: "active", when: "2m ago" },
  { key: "KEYREN-3D91B0E7-4A22-8FF1-06B4", label: "Studio Pro — annual", status: "active", when: "1h ago" },
  { key: "KEYREN-B45C2A19-EE70-3D8C-97F2", label: "Beta tester", status: "expiring", when: "4h ago" },
  { key: "KEYREN-0C6E8D34-172B-5AA9-E3D1", label: "Studio Lite", status: "revoked", when: "yesterday" },
] as const;

const TONE = {
  active: { dot: "bg-success", label: "Active" },
  expiring: { dot: "bg-warning", label: "Expires in 6d" },
  revoked: { dot: "bg-destructive", label: "Revoked" },
} as const;

export function HeroProduct() {
  return (
    <div className="relative">
      {/* pb-10 is load-bearing: the response panel below overlaps this card by
          design, and without the padding it would cover the last licence row
          rather than empty surface. */}
      <div className="overflow-hidden rounded-lg border border-border bg-surface-1 pb-10 shadow-[var(--shadow-float)] motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-3 motion-safe:duration-700 motion-safe:fill-mode-both motion-safe:ease-[var(--ease-out-expo)]">
        {/* Panel header, matching the dashboard's own */}
        <div className="flex h-9 items-center justify-between gap-3 border-b border-border-strong bg-surface-2 px-3">
          <span className="font-mono text-[12px] text-fg-tertiary">app_7Qk2mV9xB4</span>
          <span className="text-[11px] font-medium uppercase tracking-[var(--tracking-label)] text-fg-quaternary">
            4 licenses
          </span>
        </div>

        <table className="w-full">
          <tbody>
            {ROWS.map((row, index) => {
              const tone = TONE[row.status];

              return (
                <tr
                  key={row.key}
                  className="border-b border-border last:border-b-0 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1 motion-safe:duration-500 motion-safe:fill-mode-both motion-safe:ease-[var(--ease-out-expo)]"
                  // Staggered entrance, then still. Nothing here loops: a fold
                  // that keeps moving stops being a product shot and starts
                  // being a GIF.
                  style={{ animationDelay: `${240 + index * 90}ms` }}
                >
                  <td className="py-2.5 pl-3 pr-2 align-middle">
                    <KeyGlyph seed={row.key} size={20} />
                  </td>
                  <td className="py-2.5 pr-3 align-middle font-mono text-[13px] text-fg-secondary">
                    {middleTruncate(row.key, 20)}
                  </td>
                  <td className="hidden py-2.5 pr-3 align-middle text-[13px] text-fg-tertiary sm:table-cell">
                    {row.label}
                  </td>
                  <td className="py-2.5 pr-3 align-middle">
                    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[13px]">
                      <span className={`size-1.5 shrink-0 rounded-full ${tone.dot}`} aria-hidden="true" />
                      {tone.label}
                    </span>
                  </td>
                  <td className="hidden py-2.5 pr-3 text-right align-middle font-mono text-[12px] text-fg-quaternary tabular-nums lg:table-cell">
                    {row.when}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* The verification that produced the row above, offset so the two read
          as one story rather than as two panels. */}
      <div className="relative z-10 mx-4 -mt-7 overflow-hidden rounded-lg border border-border bg-surface-2 shadow-[var(--shadow-float)] motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-500 motion-safe:fill-mode-both motion-safe:ease-[var(--ease-out-expo)] motion-safe:[animation-delay:640ms] sm:mx-8">
        <div className="flex h-8 items-center gap-2 border-b border-border px-3 font-mono text-[11px]">
          <span className="text-fg-quaternary">POST</span>
          <span className="truncate text-fg-tertiary">/api/v1/licenses/verify</span>
          <span className="ml-auto flex items-center gap-1.5 whitespace-nowrap">
            <span className="size-1.5 rounded-full bg-success" aria-hidden="true" />
            <span className="text-fg-tertiary">200</span>
          </span>
        </div>
        <pre className="overflow-x-auto px-3 py-2.5 font-mono text-[12px] leading-5">
          <code>
            <span className="text-[var(--code-punct)]">{"{ "}</span>
            <span className="text-[var(--code-string)]">&quot;success&quot;</span>
            <span className="text-[var(--code-punct)]">: </span>
            <span className="text-[var(--code-keyword)]">true</span>
            <span className="text-[var(--code-punct)]">, </span>
            <span className="text-[var(--code-string)]">&quot;status&quot;</span>
            <span className="text-[var(--code-punct)]">: </span>
            <span className="text-[var(--code-string)]">&quot;active&quot;</span>
            <span className="text-[var(--code-punct)]">{" }"}</span>
          </code>
        </pre>
      </div>
    </div>
  );
}
