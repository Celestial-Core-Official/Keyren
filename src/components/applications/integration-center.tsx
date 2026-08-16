"use client";

import { useState } from "react";
import { CopyButton } from "@/components/dashboard/copy-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  SNIPPET_LABELS,
  SNIPPET_LANGUAGES,
  integrationSnippet,
  type SnippetLanguage,
} from "@/lib/integration/snippets";
import { writeUiFlag } from "@/lib/preferences";

/**
 * The four integration examples, with the developer's own application ID and
 * deployment URL already substituted in.
 *
 * Alpha_v1 offered JavaScript only, which is a reasonable guess about who is
 * integrating and a bad one to force: the desktop applications most likely to
 * need device-locked licensing are frequently C# or Python.
 */
export function IntegrationCenter({
  applicationId,
  appUrl,
}: {
  applicationId: string;
  appUrl: string;
}) {
  const [language, setLanguage] = useState<SnippetLanguage>("javascript");

  const snippet = integrationSnippet(language, { applicationId, appUrl });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Integration</CardTitle>
      </CardHeader>

      <CardContent className="space-y-5">
        <Tabs
          value={language}
          onValueChange={(value) => setLanguage(value as SnippetLanguage)}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <TabsList>
              {SNIPPET_LANGUAGES.map((candidate) => (
                <TabsTrigger key={candidate} value={candidate}>
                  {SNIPPET_LABELS[candidate]}
                </TabsTrigger>
              ))}
            </TabsList>

            <CopyButton
              value={snippet}
              label={`Copy ${SNIPPET_LABELS[language]}`}
              variant="outline"
              announce
              successMessage={`${SNIPPET_LABELS[language]} example copied.`}
              className="h-8"
              // Records that the onboarding step is done. Only a boolean
              // reaches storage; nothing about the snippet or the application.
              onCopied={() => writeUiFlag(`copied-snippet:${applicationId}`, true)}
            />
          </div>

          {SNIPPET_LANGUAGES.map((candidate) => (
            <TabsContent key={candidate} value={candidate} className="mt-4">
              <pre className="max-h-96 overflow-auto rounded-lg border border-border bg-muted/40 p-4 text-xs leading-relaxed">
                <code>{integrationSnippet(candidate, { applicationId, appUrl })}</code>
              </pre>
            </TabsContent>
          ))}
        </Tabs>

        <div className="space-y-3 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">Before you ship this</p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              The application ID is an identifier, not a credential — safe to embed.
            </li>
            <li>
              Never ship a dashboard credential, session token or the HMAC secret. Assume
              anything in a binary or a JS bundle is readable.
            </li>
            <li>Send a fingerprint you hashed on the client, not a raw hardware serial.</li>
            <li>
              A fingerprint raises the cost of key sharing. It does not make spoofing
              impossible.
            </li>
            <li>
              Verification is online-only. Decide what your software does when Keyren is
              unreachable.
            </li>
            <li>
              Handle every error code:{" "}
              <code className="font-mono text-xs">LICENSE_INVALID</code>,{" "}
              <code className="font-mono text-xs">LICENSE_REVOKED</code>,{" "}
              <code className="font-mono text-xs">LICENSE_EXPIRED</code>,{" "}
              <code className="font-mono text-xs">DEVICE_MISMATCH</code>,{" "}
              <code className="font-mono text-xs">APPLICATION_INVALID</code>,{" "}
              <code className="font-mono text-xs">APPLICATION_DISABLED</code>,{" "}
              <code className="font-mono text-xs">RATE_LIMITED</code>,{" "}
              <code className="font-mono text-xs">INTERNAL_ERROR</code>,{" "}
              <code className="font-mono text-xs">BAD_REQUEST</code>.
            </li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
