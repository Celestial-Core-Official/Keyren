"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

/**
 * The theme context, which until now did not exist.
 *
 * `next-themes` was a dependency and `ui/sonner.tsx` already called
 * `useTheme()`, but nothing ever mounted a provider. The hook returned an
 * empty context, Sonner fell back to its `"system"` default, and toasts were
 * painted from the operating system's `prefers-color-scheme` while the rest of
 * the app was pinned dark — so a developer on a light-mode machine got light
 * toasts on a dark page, and no one on a dark-mode machine could reproduce it.
 *
 * `attribute="class"` writes `light` or `dark` onto <html>, which is what
 * `@custom-variant dark (&:is(.dark *))` in globals.css matches against.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      // Without this, switching themes animates every colour transition
      // declared across the UI at once, which reads as a stutter rather than
      // a transition.
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
