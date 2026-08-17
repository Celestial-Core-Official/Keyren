import { AlertTriangle, ShieldCheck, Info } from "lucide-react";
import { cn } from "@/lib/utils";

const TONE = {
  neutral: {
    box: "border-border bg-surface-2",
    icon: "text-fg-tertiary",
    label: "text-fg-secondary",
    Icon: Info,
  },
  security: {
    box: "border-border bg-surface-2",
    icon: "text-fg-tertiary",
    label: "text-fg-secondary",
    Icon: ShieldCheck,
  },
  warning: {
    box: "border-warning-border bg-warning-subtle",
    icon: "text-warning",
    label: "text-warning",
    Icon: AlertTriangle,
  },
} as const;

/**
 * A labelled callout.
 *
 * Exists so the two places that need to say "read this before you ship"
 * — the integration reference and the API tester — say it the same way.
 * A bare `<ul>` under a bold paragraph, which is what the integration page
 * had, reads as more body copy rather than as a caution.
 */
export function Note({
  tone = "neutral",
  label,
  children,
  className,
}: {
  tone?: keyof typeof TONE;
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  const style = TONE[tone];
  const { Icon } = style;

  return (
    <div className={cn("rounded-lg border p-3.5", style.box, className)}>
      <p className={cn("flex items-center gap-2 text-[11px] font-medium uppercase tracking-[var(--tracking-label)]", style.label)}>
        <Icon className={cn("size-3.5 shrink-0", style.icon)} aria-hidden="true" />
        {label}
      </p>
      <div className="mt-2.5 text-[13px] leading-relaxed text-fg-tertiary">{children}</div>
    </div>
  );
}
