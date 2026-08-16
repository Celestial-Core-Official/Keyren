"use client";

import { ClerkProvider } from "@clerk/nextjs";
import { useTheme } from "next-themes";
import { SIGN_IN_URL, SIGN_UP_URL } from "@/lib/auth/routes";

/**
 * Clerk, following the app's theme.
 *
 * Clerk's appearance is a prop, not a stylesheet, so it cannot read the CSS
 * variables the rest of the UI is built from — it has to be handed concrete
 * colours. Those colours were previously hardcoded dark, which was correct
 * while the app was dark-only and becomes a white-on-white sign-in form the
 * moment it is not.
 *
 * The hex values below are the sRGB equivalents of the oklch tokens in
 * globals.css, in the same order. They are duplicated rather than referenced
 * because Clerk parses these to derive its own shades and cannot be given a
 * `var()`. If a token there changes, change its twin here.
 *
 * This must be mounted INSIDE `ThemeProvider`. Mounted outside it, `useTheme`
 * returns an empty context and silently resolves to the light branch — the
 * same failure that produced the Sonner bug, with the same lack of any visible
 * error.
 */

const DARK = {
  colorBackground: "#131316", // --card: the modal is a surface, not the page
  colorForeground: "#fafafa", // --foreground
  colorPrimary: "#6366f1", // --primary
  colorPrimaryForeground: "#fafafa", // --primary-foreground
  colorInput: "#1a1a1f",
  colorInputForeground: "#fafafa",
  colorMuted: "#27272b", // --muted
  colorMutedForeground: "#a1a1aa", // --muted-foreground
  colorBorder: "#27272b", // --border
  colorRing: "#6366f1", // --ring
  colorDanger: "#ef4444", // --destructive
  borderRadius: "0.5rem",
} as const;

const LIGHT = {
  colorBackground: "#ffffff", // --card
  colorForeground: "#111113", // --foreground
  colorPrimary: "#4f46e5", // --primary, darkened for contrast on white
  colorPrimaryForeground: "#fafafa",
  colorInput: "#ffffff",
  colorInputForeground: "#111113",
  colorMuted: "#f4f4f5", // --muted
  colorMutedForeground: "#65656d", // --muted-foreground
  colorBorder: "#e4e4e7", // --border
  colorRing: "#4f46e5", // --ring
  colorDanger: "#dc2626", // --destructive
  borderRadius: "0.5rem",
} as const;

export function ThemedClerkProvider({ children }: { children: React.ReactNode }) {
  const { resolvedTheme } = useTheme();

  // `resolvedTheme` is undefined until the provider has read storage and the
  // system preference. Dark is the better guess for that first frame: it is
  // what every existing developer is already running.
  const variables = resolvedTheme === "light" ? LIGHT : DARK;

  return (
    <ClerkProvider
      // The client half of the same routing the middleware sets: these are
      // what Clerk's own components link to, so "Don't have an account?" on
      // the sign-in page reaches Keyren's sign-up page rather than the hosted
      // portal. Set in code rather than through
      // `NEXT_PUBLIC_CLERK_SIGN_IN_URL` because a deployment that forgets an
      // environment variable would silently go back to the portal.
      signInUrl={SIGN_IN_URL}
      signUpUrl={SIGN_UP_URL}
      appearance={{ variables }}
    >
      {children}
    </ClerkProvider>
  );
}
