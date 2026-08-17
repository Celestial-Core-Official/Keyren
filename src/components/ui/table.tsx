"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <div
      data-slot="table-container"
      /*
       * `overflow-x: auto` forces `overflow-y` to compute to `auto` as well,
       * which makes this element a scrollport — and a `position: sticky`
       * `<thead>` inside it then sticks to a container that never scrolls
       * vertically, so it silently does nothing.
       *
       * `overflow-x: clip` does not force the other axis, so sticky survives.
       * It is applied only from `xl`, where every table in this application
       * fits its column widths: below that the columns genuinely can overflow,
       * and reachable content beats a sticky header.
       */
      className="relative w-full overflow-x-auto xl:overflow-x-clip"
    >
      <table
        data-slot="table"
        className={cn("w-full caption-bottom text-sm", className)}
        {...props}
      />
    </div>
  )
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      // The head rule is deliberately heavier than the row rules. A table
      // whose header separates more strongly than its rows is the cheapest
      // craft signal available, and it is what stops a long list reading as an
      // undifferentiated grid.
      className={cn("[&_tr]:border-b [&_tr]:border-border-strong", className)}
      {...props}
    />
  )
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    />
  )
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        "border-t bg-muted/50 font-medium [&>tr]:last:border-b-0",
        className
      )}
      {...props}
    />
  )
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        // A selected row gets a left rail rather than a fill: a 2px accent
        // edge is legible at a glance down a column of 40 rows, where a
        // background tint at the contrast a light theme allows is not.
        "border-b border-border transition-colors duration-[var(--speed-quick)] hover:bg-accent/60 has-aria-expanded:bg-accent/60 data-[state=selected]:bg-accent/40 data-[state=selected]:shadow-[inset_2px_0_0_var(--primary)]",
        className
      )}
      {...props}
    />
  )
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "h-9 px-3 text-left align-middle text-[13px] font-medium whitespace-nowrap text-fg-tertiary [&:has([role=checkbox])]:pr-0",
        className
      )}
      {...props}
    />
  )
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        "px-3 py-2.5 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0",
        className
      )}
      {...props}
    />
  )
}

function TableCaption({
  className,
  ...props
}: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("mt-4 text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}
