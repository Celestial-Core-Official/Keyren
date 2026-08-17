"use client";

import Link from "next/link";
import { useState } from "react";
import { Check, Circle, X } from "lucide-react";
import { CreateLicenseDialog } from "@/components/licenses/create-license-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { writeUiFlag } from "@/lib/preferences";
import { useUiFlag } from "@/lib/use-preferences";
import { cn } from "@/lib/utils";

/**
 * The three steps between "I have an application" and "my software is licensed".
 *
 * Two of the three are derived from real data rather than remembered: a
 * license exists or it does not, and an activation row is only ever written
 * by a successful verification. Nothing has to be marked complete, so the
 * checklist cannot claim a step was done when it was not — or, worse, ask a
 * developer to redo something they already did.
 *
 * Only the middle step needs a stored signal, because copying a snippet
 * leaves no trace on the server, and adding a database column to record that
 * a developer clicked Copy would be a very expensive way to track something
 * this small. It stores a single boolean.
 */
export function OnboardingChecklist({
  applicationId,
  applicationSlug,
  hasLicense,
  hasVerification,
}: {
  applicationId: string;
  applicationSlug: string;
  hasLicense: boolean;
  hasVerification: boolean;
}) {
  const dismissKey = `onboarding-dismissed:${applicationId}`;
  const copiedKey = `copied-snippet:${applicationId}`;

  // Subscribed, not read during render. Reading storage inside a `useState`
  // initializer runs it on the server too — where storage does not exist — and
  // again at hydration, where it does. React then finds a card the server did
  // not render, or a step count that disagrees, and regenerates the entire
  // root on the client. `useUiFlag` renders the server's `false` through
  // hydration and swaps to the stored value immediately after.
  const storedDismissed = useUiFlag(dismissKey);
  const copiedSnippet = useUiFlag(copiedKey);

  // A browser that refuses storage still gets to dismiss the card for this
  // visit; it simply comes back on the next one.
  const [dismissedHere, setDismissedHere] = useState(false);
  const dismissed = storedDismissed || dismissedHere;

  const steps = [
    {
      title: "Generate a license",
      description: "The key is shown once, immediately after creation.",
      done: hasLicense,
      action: (
        <CreateLicenseDialog
          applicationId={applicationId}
          applicationSlug={applicationSlug}
          variant="outline"
        >
          Generate a license
        </CreateLicenseDialog>
      ),
    },
    {
      title: "Copy an integration example",
      description: "JavaScript, Python, cURL or C#, with your application ID already in it.",
      done: copiedSnippet,
      action: (
        <Button asChild size="sm" variant="outline">
          <Link href={`/dashboard/applications/${applicationId}/integrate`}>
            Go to examples
          </Link>
        </Button>
      ),
    },
    {
      title: "Run one successful verification",
      description:
        "Send a real request from the tester in this application's settings. Once one succeeds, your integration works.",
      done: hasVerification,
      action: (
        <Button asChild size="sm" variant="outline">
          <Link href={`/dashboard/applications/${applicationId}/settings`}>
            Go to the tester
          </Link>
        </Button>
      ),
    },
  ];

  const completed = steps.filter((step) => step.done).length;

  // Gone once finished, and gone if the developer says so. A permanent
  // checklist on an application they set up months ago is clutter.
  if (dismissed || completed === steps.length) return null;

  const nextStep = steps.find((step) => !step.done);

  return (
    <Card className="border-primary/25 bg-primary/[0.03]">
      <CardHeader className="flex-row items-start justify-between gap-4 space-y-0 pb-3">
        <div className="space-y-1">
          <CardTitle className="text-base">Getting started</CardTitle>
          <p className="text-sm text-muted-foreground">
            {completed} of {steps.length} done — next up, {nextStep?.title.toLowerCase()}.
          </p>
        </div>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8 shrink-0"
          aria-label="Dismiss getting started"
          onClick={() => {
            writeUiFlag(dismissKey, true);
            setDismissedHere(true);
          }}
        >
          <X className="size-4" />
        </Button>
      </CardHeader>

      <CardContent>
        <ol className="space-y-3">
          {steps.map((step, index) => (
            <li key={step.title} className="flex flex-wrap items-start gap-3">
              <span
                aria-hidden="true"
                className={cn(
                  "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border text-[10px]",
                  step.done
                    ? "border-success-border bg-success-subtle text-success"
                    : "border-border text-muted-foreground",
                )}
              >
                {step.done ? <Check className="size-3" /> : <Circle className="size-2 fill-current" />}
              </span>

              <div className="min-w-0 flex-1 space-y-0.5">
                <p
                  className={cn(
                    "text-sm font-medium",
                    step.done && "text-muted-foreground line-through",
                  )}
                >
                  <span className="sr-only">
                    {step.done ? "Completed: " : "Not yet done: "}
                  </span>
                  {index + 1}. {step.title}
                </p>
                {!step.done ? (
                  <p className="text-sm text-muted-foreground">{step.description}</p>
                ) : null}
              </div>

              {/* Only the next incomplete step carries an action, so there is
                  exactly one obvious thing to do. */}
              {step === nextStep ? <div className="shrink-0">{step.action}</div> : null}
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
