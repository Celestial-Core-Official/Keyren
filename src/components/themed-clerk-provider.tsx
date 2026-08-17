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
 * They were read by rasterising each token through a canvas rather than
 * converted by hand — oklch to sRGB is not an eyeball operation, and the two
 * border values are the alpha-composited result of `--border` over the
 * surface behind it, since Clerk needs a solid colour where the app uses a
 * translucent one.
 *
 * This must be mounted INSIDE `ThemeProvider`. Mounted outside it, `useTheme`
 * returns an empty context and silently resolves to the light branch — the
 * same failure that produced the Sonner bug, with the same lack of any visible
 * error.
 */

const DARK = {
  colorBackground: "#0e0e10", // --surface-1: the modal is a surface, not the page
  colorForeground: "#f3f3f5", // --foreground
  colorPrimary: "#5d68e3", // --primary
  colorPrimaryForeground: "#fafafa", // --primary-foreground
  colorInput: "#141517", // --surface-2
  colorInputForeground: "#f3f3f5",
  colorMuted: "#1b1c1e", // --muted
  colorMutedForeground: "#929399", // --fg-tertiary
  colorBorder: "#26262a", // --border, composited over --surface-1
  colorRing: "#7281ff", // --ring
  colorDanger: "#e64343", // --destructive
  borderRadius: "0.375rem", // --radius
} as const;

const LIGHT = {
  colorBackground: "#ffffff", // --surface-1
  colorForeground: "#0b0c0f", // --foreground
  colorPrimary: "#4a50d1", // --primary, darkened for contrast on white
  colorPrimaryForeground: "#fafafa",
  colorInput: "#ffffff",
  colorInputForeground: "#0b0c0f",
  colorMuted: "#f3f3f5", // --muted
  colorMutedForeground: "#5d5f65", // --fg-tertiary
  colorBorder: "#e4e5e7", // --border, composited over white
  colorRing: "#545ddf", // --ring
  colorDanger: "#c50220", // --destructive
  borderRadius: "0.375rem", // --radius
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
      appearance={{
        variables: {
          ...variables,
          // Clerk renders its own DOM, so without this it sets the whole form
          // in its default stack while the page around it is in Instrument
          // Sans — the single detail that makes a hosted component read as an
          // embed from another product.
          fontFamily: "var(--font-sans-loaded)",
          fontFamilyButtons: "var(--font-sans-loaded)",
        },
        elements: {
          // The page already supplies the card: a second border and shadow
          // around the form would be a panel inside a panel.
          cardBox: { boxShadow: "none", border: "none" },
          card: { boxShadow: "none", border: "none", background: "transparent" },
        },
      }}
    >
      {children}
    </ClerkProvider>
  );
}
