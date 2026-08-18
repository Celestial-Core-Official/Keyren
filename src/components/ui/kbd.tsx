import { cn } from "@/lib/utils";

/**
 * A keyboard hint chip.
 *
 * Deliberately sans, not mono: a shortcut is a label, and the mono face in
 * this product is reserved for things a developer copies — keys, IDs,
 * fingerprints, codes. Putting `⌘K` in the same face as a licence key would
 * suggest it is a value.
 *
 * Deliberately recessed rather than a raised 3D key. It sits inside a search
 * field and inside command-palette rows, where a bevel competes with the
 * control it is annotating.
 */
export function Kbd({ className, ...props }: React.ComponentProps<"kbd">) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-5 select-none items-center justify-center rounded-sm border border-border bg-background px-1 font-sans text-xs leading-none text-fg-tertiary",
        className,
      )}
      {...props}
    />
  );
}
