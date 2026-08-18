"use client";

import { useState } from "react";
import { CopyButton } from "@/components/dashboard/copy-button";
import { CodeBlock } from "@/components/ui/code-block";
import { Note } from "@/components/ui/note";
import { cn } from "@/lib/utils";
import {
  SNIPPET_FILENAMES,
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
 *
 * Alpha_v3 puts the language chips and the copy control inside the code
 * container's own header bar, so the snippet and the things that act on it are
 * one object rather than three stacked ones.
 */
const ERROR_CODES = [
  "LICENSE_INVALID",
  "LICENSE_REVOKED",
  "LICENSE_EXPIRED",
  "DEVICE_MISMATCH",
  "APPLICATION_INVALID",
  "APPLICATION_DISABLED",
  "RATE_LIMITED",
  "INTERNAL_ERROR",
  "BAD_REQUEST",
] as const;

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
    <div className="space-y-5">
      <div className="overflow-hidden rounded-lg border border-border bg-surface-2">
        <div className="flex h-9 items-center gap-2 border-b border-border px-2">
          <span className="hidden truncate px-1.5 font-mono text-[12px] text-fg-quaternary sm:inline">
            {SNIPPET_FILENAMES[language]}
          </span>

          <div className="ml-auto flex items-center gap-0.5">
            {SNIPPET_LANGUAGES.map((candidate) => (
              <button
                key={candidate}
                type="button"
                onClick={() => setLanguage(candidate)}
                aria-pressed={candidate === language}
                className={cn(
                  "h-6 rounded-sm px-2 text-[11px] font-medium transition-colors duration-[var(--speed-quick)] focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                  candidate === language
                    ? "bg-accent text-foreground"
                    : "text-fg-quaternary hover:text-fg-secondary",
                )}
              >
                {SNIPPET_LABELS[candidate]}
              </button>
            ))}
          </div>

          <CopyButton
            value={snippet}
            label={`Copy ${SNIPPET_LABELS[language]}`}
            variant="ghost"
            className="h-6 px-1.5"
            announce
            successMessage={`${SNIPPET_LABELS[language]} example copied`}
            // Records that the onboarding step is done. Only a boolean reaches
            // storage; nothing about the snippet or the application. This is
            // what feeds the checklist, so it must survive any restyling.
            onCopied={() => writeUiFlag(`copied-snippet:${applicationId}`, true)}
          />
        </div>

        <CodeBlock source={snippet} language={language} className="max-h-[420px]" />
      </div>

      <Note tone="security" label="Before you ship this">
        <ul className="list-disc space-y-1.5 pl-4">
          <li>The application ID is an identifier, not a credential — safe to embed.</li>
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
        </ul>
      </Note>

      <div>
        <p className="text-[13px] font-semibold tracking-[var(--tracking-heading)]">
          Handle every error code
        </p>
        <p className="mt-1 text-[13px] text-fg-tertiary">
          Each one is a different decision for your software. Treating them as one failure
          is how a revoked licence and a flaky network become the same bug.
        </p>
        {/* A grid of chips, not nine inline <code> spans inside one sentence —
            which is what this was, and is unreadable. */}
        <ul className="mt-3 grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
          {ERROR_CODES.map((code) => (
            <li key={code}>
              <code className="block truncate rounded-sm border border-border bg-surface-2 px-2 py-1 font-mono text-[12px] text-fg-secondary">
                {code}
              </code>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
