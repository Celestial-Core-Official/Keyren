"use client";

import { useState } from "react";
import { FieldError, SubmitButton } from "@/components/dashboard/feedback";
import { Button } from "@/components/ui/button";
import {
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  DURATION_OPTIONS,
  formatExpiryPreview,
  todayInUtc,
  type DurationValue,
} from "@/lib/licenses/expiration";
import {
  BATCH_QUANTITY_MAX,
  BATCH_QUANTITY_MIN,
  LICENSE_LABEL_MAX,
  LICENSE_NOTES_MAX,
} from "@/lib/licenses/types";
import {
  resolveLicensePreferences,
  writeLicensePreferences,
  type ExpirationMode,
} from "@/lib/preferences";

const QUANTITY_PRESETS = [1, 5, 10, 25] as const;

/**
 * The license generation form.
 *
 * Split out of the dialog so the dialog can be about lifecycle — opening,
 * remounting, swapping to the result view — while this is only about the
 * shape of a license.
 */
export function LicenseCreateForm({
  applicationId,
  formAction,
  fieldErrors,
  onCancel,
}: {
  applicationId: string;
  formAction: (formData: FormData) => void;
  fieldErrors: Record<string, string>;
  onCancel: () => void;
}) {
  // Read once, lazily. This component only ever mounts client-side (the
  // dialog's content does not exist until it opens), so there is no server
  // render to disagree with.
  //
  // Resolved, not read directly: an application that has never issued a license
  // opens with the account defaults from Settings, and one that has keeps its
  // own memory.
  const [initial] = useState(() => resolveLicensePreferences(applicationId));

  const [mode, setMode] = useState<ExpirationMode>(initial.mode);
  const [duration, setDuration] = useState<DurationValue>(initial.duration);
  const [hwidLocked, setHwidLocked] = useState(initial.hwidLocked);
  const [quantity, setQuantity] = useState(initial.quantity);
  const [expiresAt, setExpiresAt] = useState("");
  const [label, setLabel] = useState("");

  const [minDate] = useState(() => todayInUtc());
  const preview = mode === "date" ? formatExpiryPreview(expiresAt) : null;
  const batch = quantity > 1;

  function submit(formData: FormData) {
    // Remembered only on a real submission, so a developer who opens the
    // dialog, changes their mind and cancels does not silently rewrite their
    // own defaults.
    writeLicensePreferences(applicationId, { mode, duration, hwidLocked, quantity });
    formAction(formData);
  }

  return (
    <form action={submit}>
      <input type="hidden" name="applicationId" value={applicationId} />
      <input type="hidden" name="mode" value={mode} />
      <input type="hidden" name="hwidLocked" value={hwidLocked ? "on" : "off"} />

      <DialogHeader>
        <DialogTitle>Generate {batch ? `${quantity} licenses` : "license"}</DialogTitle>
        <DialogDescription>
          {batch ? "The keys are" : "The key is"} shown once, immediately after creation.
        </DialogDescription>
      </DialogHeader>

      <div className="max-h-[60vh] space-y-5 overflow-y-auto py-5 pr-1">
        <div className="space-y-2">
          <Label htmlFor="quantity">How many</Label>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              id="quantity"
              name="quantity"
              type="number"
              inputMode="numeric"
              min={BATCH_QUANTITY_MIN}
              max={BATCH_QUANTITY_MAX}
              value={quantity}
              onChange={(event) => setQuantity(Number(event.target.value))}
              className="w-24"
              aria-invalid={fieldErrors.quantity ? true : undefined}
              aria-describedby={fieldErrors.quantity ? "quantity-error" : undefined}
            />
            <div className="flex gap-1">
              {QUANTITY_PRESETS.map((preset) => (
                <Button
                  key={preset}
                  type="button"
                  variant={quantity === preset ? "secondary" : "ghost"}
                  size="sm"
                  className="h-8 w-10 tabular-nums"
                  onClick={() => setQuantity(preset)}
                  aria-pressed={quantity === preset}
                >
                  {preset}
                </Button>
              ))}
            </div>
          </div>
          <FieldError id="quantity-error">{fieldErrors.quantity}</FieldError>
          <p className="text-xs text-muted-foreground">
            Up to {BATCH_QUANTITY_MAX} at a time. Every license in a batch shares these
            settings.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="label">Label {batch ? "prefix" : ""} (optional)</Label>
          <Input
            id="label"
            name="label"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            maxLength={LICENSE_LABEL_MAX}
            placeholder={batch ? "Acme Corp" : "Acme Corp — invoice 8891"}
            autoComplete="off"
            aria-invalid={fieldErrors.label ? true : undefined}
            aria-describedby={fieldErrors.label ? "label-error" : undefined}
          />
          <FieldError id="label-error">{fieldErrors.label}</FieldError>
          <p className="text-xs text-muted-foreground">
            {batch && label.trim() !== ""
              ? `Numbered automatically: “${label.trim()} 1” through “${label.trim()} ${quantity}”.`
              : "A customer, an order — whatever makes this recognisable later. Never sent to your customers."}
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="notes">Notes (optional)</Label>
          <textarea
            id="notes"
            name="notes"
            rows={2}
            maxLength={LICENSE_NOTES_MAX}
            placeholder="Anything you want to remember about these licenses."
            className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            aria-invalid={fieldErrors.notes ? true : undefined}
            aria-describedby={fieldErrors.notes ? "notes-error" : undefined}
          />
          <FieldError id="notes-error">{fieldErrors.notes}</FieldError>
        </div>

        <div className="space-y-2">
          <Label htmlFor="mode-select">Expiration</Label>
          <Select value={mode} onValueChange={(value) => setMode(value as ExpirationMode)}>
            <SelectTrigger id="mode-select">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="permanent">Permanent — never expires</SelectItem>
              <SelectItem value="duration">Expires after a duration</SelectItem>
              <SelectItem value="date">Expires on a specific date</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {mode === "duration" ? (
          <div className="space-y-2">
            <Label htmlFor="duration">Duration</Label>
            <select
              id="duration"
              name="duration"
              value={duration}
              onChange={(event) => setDuration(event.target.value as DurationValue)}
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
            >
              {DURATION_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              Counted from now, not from first activation.
            </p>
          </div>
        ) : null}

        {mode === "date" ? (
          <div className="space-y-2">
            <Label htmlFor="expiresAt">Expires on</Label>
            <Input
              id="expiresAt"
              name="expiresAt"
              type="date"
              required
              // The browser refuses a past date before the request is made.
              // The server still checks — this only saves a round trip.
              min={minDate}
              value={expiresAt}
              onChange={(event) => setExpiresAt(event.target.value)}
              aria-invalid={fieldErrors.expiresAt ? true : undefined}
              aria-describedby={
                fieldErrors.expiresAt ? "expires-error" : preview ? "expires-preview" : undefined
              }
            />
            <FieldError id="expires-error">{fieldErrors.expiresAt}</FieldError>
            {preview ? (
              <p id="expires-preview" className="text-xs text-muted-foreground">
                {preview} — the license works for all of the day you pick.
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="flex items-start justify-between gap-4 rounded-lg border border-border p-4">
          <div className="space-y-1">
            <Label htmlFor="hwid">Lock to one device</Label>
            <p className="text-xs text-muted-foreground">
              The first device to authenticate claims the license. Others are refused
              until you reset the activation.
            </p>
          </div>
          <Switch id="hwid" checked={hwidLocked} onCheckedChange={setHwidLocked} />
        </div>
      </div>

      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <SubmitButton pendingLabel={batch ? "Generating…" : "Generating…"}>
          {batch ? `Generate ${quantity} licenses` : "Generate license"}
        </SubmitButton>
      </DialogFooter>
    </form>
  );
}
