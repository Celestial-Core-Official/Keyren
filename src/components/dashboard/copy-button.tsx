"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Writes a value to the clipboard, and says so either way.
 *
 * Alpha_v1 caught the rejection and did nothing on purpose, reasoning that the
 * text was selectable anyway. That is the wrong trade for this app: the one
 * value a developer copies under real pressure is a plaintext license key
 * during its only appearance, and a silent failure there means they dismiss
 * the dialog believing they saved something they did not.
 */
export function CopyButton({
  value,
  label = "Copy",
  className,
  announce = false,
  variant = "ghost",
  successMessage,
}: {
  value: string;
  label?: string;
  className?: string;
  /** Raise a toast on success too, for copies worth confirming loudly. */
  announce?: boolean;
  variant?: "ghost" | "outline" | "secondary";
  successMessage?: string;
}) {
  const [copied, setCopied] = useState(false);
  const [status, setStatus] = useState("");

  async function copy() {
    try {
      // Optional chaining rather than an assumption: the API is absent
      // entirely over plain HTTP on a non-localhost origin, which is exactly
      // the setup a developer testing a deployment preview is likely to have.
      if (!navigator.clipboard?.writeText) {
        throw new Error("Clipboard unavailable");
      }

      await navigator.clipboard.writeText(value);

      setCopied(true);
      setStatus("Copied to clipboard");
      setTimeout(() => setCopied(false), 1600);

      if (announce) toast.success(successMessage ?? "Copied to clipboard.");
    } catch {
      setStatus("Copy failed");
      toast.error(
        "Could not copy — your browser blocked clipboard access. Select the text and copy it manually.",
      );
    }
  }

  return (
    <>
      <Button
        type="button"
        variant={variant}
        size="sm"
        onClick={copy}
        aria-label={copied ? "Copied" : label || "Copy"}
        className={cn("h-7 gap-1.5 px-2 text-xs text-muted-foreground", className)}
      >
        {copied ? (
          <Check className="size-3.5 text-emerald-400" />
        ) : (
          <Copy className="size-3.5" />
        )}
        {label ? (copied ? "Copied" : label) : null}
      </Button>

      {/* Screen readers get the outcome even when the only visible change is
          an icon swap inside the button they just activated. */}
      <span aria-live="polite" className="sr-only">
        {status}
      </span>
    </>
  );
}
