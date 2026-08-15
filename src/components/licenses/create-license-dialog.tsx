"use client";

import { useActionState, useState } from "react";
import { AlertTriangle, Plus } from "lucide-react";
import {
  createLicenseAction,
  type CreateLicenseState,
} from "@/app/dashboard/products/[productId]/licenses/actions";
import { DURATION_OPTIONS } from "@/lib/licenses/expiration";
import { CopyButton } from "@/components/dashboard/copy-button";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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

const INITIAL: CreateLicenseState = { error: null, plaintextKey: null };

type Mode = "permanent" | "date" | "duration";

export function CreateLicenseDialog({ productId }: { productId: string }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("permanent");
  const [hwidLocked, setHwidLocked] = useState(true);
  const [acknowledged, setAcknowledged] = useState(false);

  const [state, formAction, pending] = useActionState(createLicenseAction, INITIAL);

  // Reset the acknowledgement whenever a new key arrives, so the developer
  // cannot carry a previous confirmation over to a key they have not saved.
  // Adjusted during render rather than in an effect — React's documented
  // pattern for resetting state when a value changes, which avoids the extra
  // commit-then-effect render pass a useEffect would cost here.
  const [lastKey, setLastKey] = useState(state.plaintextKey);
  if (state.plaintextKey !== lastKey) {
    setLastKey(state.plaintextKey);
    if (state.plaintextKey) setAcknowledged(false);
  }

  function closeAll() {
    setOpen(false);
    setMode("permanent");
    setHwidLocked(true);
    setAcknowledged(false);
  }

  // Once a key exists, the form is replaced by the reveal. There is no path
  // back to the form without dismissing the key, and no way to re-open it.
  if (state.plaintextKey) {
    return (
      <Dialog open onOpenChange={() => undefined}>
        <DialogContent
          showCloseButton={false}
          onEscapeKeyDown={(event) => event.preventDefault()}
          onInteractOutside={(event) => event.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="size-4 text-amber-500" />
              Save this key now
            </DialogTitle>
            <DialogDescription>
              This is the only time Keyren will ever show this license key. Only a secure
              derived value is stored in the database, so it cannot be recovered or
              displayed again.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-5">
            <div className="rounded-lg border border-border bg-muted/40 p-4">
              <code className="block break-all font-mono text-sm">{state.plaintextKey}</code>
            </div>
            <CopyButton value={state.plaintextKey} label="Copy license key" />

            <label className="flex cursor-pointer items-start gap-2.5 pt-2 text-sm">
              <input
                type="checkbox"
                checked={acknowledged}
                onChange={(event) => setAcknowledged(event.target.checked)}
                className="mt-0.5 size-4 accent-primary"
              />
              <span className="text-muted-foreground">
                I have saved this key. I understand it cannot be shown again.
              </span>
            </label>
          </div>

          <DialogFooter>
            <Button onClick={closeAll} disabled={!acknowledged}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5">
          <Plus className="size-4" />
          Generate license
        </Button>
      </DialogTrigger>

      <DialogContent>
        <form action={formAction}>
          <input type="hidden" name="productId" value={productId} />
          <input type="hidden" name="mode" value={mode} />
          <input type="hidden" name="hwidLocked" value={hwidLocked ? "on" : "off"} />

          <DialogHeader>
            <DialogTitle>Generate license</DialogTitle>
            <DialogDescription>
              The key is shown once, immediately after creation.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-5">
            <div className="space-y-2">
              <Label htmlFor="mode-select">Expiration</Label>
              <Select value={mode} onValueChange={(value) => setMode(value as Mode)}>
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
                  defaultValue="30d"
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
                <Input id="expiresAt" name="expiresAt" type="date" required />
                <p className="text-xs text-muted-foreground">Interpreted as UTC.</p>
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

            {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Generating…" : "Generate license"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
