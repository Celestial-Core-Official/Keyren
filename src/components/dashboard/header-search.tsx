"use client";

import { Search } from "lucide-react";
import { Kbd } from "@/components/ui/kbd";
import { openCommandPalette } from "@/components/dashboard/command-palette";

/**
 * The visible half of the command palette.
 *
 * ⌘K has been bound since Alpha_v2 and the chrome has never shown that it
 * exists, so the feature was effectively invisible to anyone who had not
 * opened the shortcuts overlay first. Every comparable product puts a search
 * control in the header with the shortcut rendered as a chip inside the
 * field — the chip is what teaches the binding.
 *
 * This is a button rather than an input: the real input lives in the palette,
 * and two focusable text fields both claiming to be "search" is worse than
 * one affordance that opens the other.
 */
export function HeaderSearch() {
  return (
    <button
      type="button"
      onClick={openCommandPalette}
      className="hidden h-8 w-56 items-center gap-2 rounded-md border border-border bg-surface-1 px-2.5 text-left text-[13px] text-fg-quaternary transition-colors duration-[var(--speed-quick)] hover:border-border-strong hover:text-fg-tertiary focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none sm:flex lg:w-72"
    >
      <Search className="size-3.5 shrink-0 opacity-70" aria-hidden="true" />
      <span className="flex-1">Search…</span>
      <Kbd aria-hidden="true">⌘K</Kbd>
    </button>
  );
}
