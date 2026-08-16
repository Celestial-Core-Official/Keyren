import { cn } from "@/lib/utils";

/**
 * A settings section, and the rows inside it.
 *
 * Deliberately not a `<Card>` each. Every block in the dashboard used to be a
 * card with the same border and the same weight, which left the eye nothing to
 * grab — when everything is a card, nothing is. A section here is a heading and
 * a hairline-separated list, so the headings carry the structure and the rows
 * stay quiet.
 */
export function SettingSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-1">
      <h2 className="text-sm font-medium">{title}</h2>
      {description ? (
        <p className="text-sm text-muted-foreground">{description}</p>
      ) : null}
      <div className="mt-3 divide-y divide-border rounded-lg border border-border">
        {children}
      </div>
    </section>
  );
}

/**
 * One setting: what it is on the left, the control that changes it on the
 * right.
 *
 * `hint` is for a constraint the developer cannot infer from the control — a
 * unit, a bound, a consequence. It is not for explaining why the setting
 * exists, and not for defending the design; that reasoning belongs in the
 * comments, where it costs the reader nothing.
 */
export function SettingRow({
  label,
  hint,
  htmlFor,
  children,
  className,
}: {
  label: string;
  hint?: string;
  htmlFor?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3",
        className,
      )}
    >
      <div className="min-w-0 space-y-0.5">
        <label htmlFor={htmlFor} className="block text-sm">
          {label}
        </label>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}
