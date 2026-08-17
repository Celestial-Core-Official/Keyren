import type { Metadata } from "next";
import { IBM_Plex_Mono, Instrument_Sans } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemedClerkProvider } from "@/components/themed-clerk-provider";
import "./globals.css";

/**
 * Two faces, each with a job.
 *
 * Instrument Sans is the voice. IBM Plex Mono is the product's own object:
 * every licence key, application ID, device fingerprint, error code, status
 * and numeral is set in it, which is category-correct rather than decorative —
 * the thing this application exists to issue is a string a developer copies.
 *
 * Deliberately not Geist, which is now v0's default output face and therefore
 * reads as a default rather than a decision, and deliberately not the stock
 * Inter cut for the same reason.
 *
 * Both are fetched once at build and self-hosted, so no request leaves a
 * visitor's browser for a third-party origin at render time.
 */
const sans = Instrument_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans-loaded",
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
  variable: "--font-mono-loaded",
});

export const metadata: Metadata = {
  title: "Keyren — Software licensing for developers",
  description: "Add secure license authentication in 5 minutes.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // `suppressHydrationWarning` is required, not defensive: next-themes writes
    // the theme class onto <html> from a blocking inline script before React
    // hydrates, so the server's markup and the client's first read of the DOM
    // legitimately disagree on exactly this element.
    <html
      lang="en"
      className={`${sans.variable} ${mono.variable}`}
      suppressHydrationWarning
    >
      {/* Colours come from `@layer base` in globals.css, which already applies
          `bg-background text-foreground` here. The hardcoded near-black and
          neutral-100 that used to sit on this element were overriding the
          token system with the dark palette, which is why a theme switch had
          nothing to switch. */}
      <body className="min-h-screen antialiased">
        <ThemeProvider>
          <ThemedClerkProvider>{children}</ThemedClerkProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
