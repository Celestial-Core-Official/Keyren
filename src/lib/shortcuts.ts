/**
 * The keyboard shortcuts, as data.
 *
 * Deliberately NOT in `components/dashboard/keyboard-shortcuts.tsx`, which is
 * a `"use client"` module. A server component importing a plain value from a
 * client module receives a client-reference proxy rather than the value, so
 * the settings page's `.map` over this list threw during prerender — a
 * failure that only surfaces in `next build`, since both files behave
 * normally under Vitest.
 */
export const KEYBOARD_SHORTCUTS = [
  { keys: ["⌘", "K"], description: "Search applications and licenses from anywhere" },
  { keys: ["/"], description: "Focus the search box on the current page" },
  { keys: ["N"], description: "New application, or generate a license" },
  { keys: ["?"], description: "Show this list" },
  { keys: ["Esc"], description: "Close a dialog or menu" },
  { keys: ["Tab"], description: "Move between controls" },
] as const;
