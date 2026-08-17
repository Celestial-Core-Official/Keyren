export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-4">
      <div className="space-y-1">
        {/* Explicit tracking rather than `tracking-tight`: the scale here is a
            function of optical size, and 20px wants a different number from
            the display sizes on the marketing page. */}
        <h1 className="text-xl font-semibold tracking-[var(--tracking-heading)]">{title}</h1>
        {description ? (
          <p className="text-[13px] text-fg-tertiary">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}
