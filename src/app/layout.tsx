import type { Metadata } from "next";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemedClerkProvider } from "@/components/themed-clerk-provider";
import "./globals.css";

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
    <html lang="en" suppressHydrationWarning>
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
