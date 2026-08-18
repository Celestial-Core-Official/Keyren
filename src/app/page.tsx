import { Hero } from "@/components/marketing/hero";
import { HowItWorks } from "@/components/marketing/how-it-works";
import { Integration } from "@/components/marketing/integration";
import { SecurityModel } from "@/components/marketing/security-model";
import { SiteHeader } from "@/components/marketing/site-header";
import { ClosingCta, SiteFooter } from "@/components/marketing/site-footer";
import { env } from "@/env";
import {
  integrationSnippet,
  SNIPPET_LANGUAGES,
  type SnippetLanguage,
} from "@/lib/integration/snippets";

/**
 * One focused scroll.
 *
 * There is no pricing table, no logo wall, no testimonial and no metrics
 * banner, because there are no customers, no prices and no metrics. Padding a
 * pre-revenue product with the furniture of a mature one is the tell it is
 * trying to hide.
 */
export default function LandingPage() {
  // Generated on the server by the same module the dashboard's Integrate page
  // uses, so the two can never drift apart.
  const snippets = Object.fromEntries(
    SNIPPET_LANGUAGES.map((language) => [
      language,
      integrationSnippet(language, {
        applicationId: "app_7Qk2mV9xB4",
        appUrl: env.NEXT_PUBLIC_APP_URL,
      }),
    ]),
  ) as Record<SnippetLanguage, string>;

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main>
        <Hero />
        <HowItWorks />
        <SecurityModel />
        <Integration snippets={snippets} />
        <ClosingCta />
      </main>
      <SiteFooter />
    </div>
  );
}
