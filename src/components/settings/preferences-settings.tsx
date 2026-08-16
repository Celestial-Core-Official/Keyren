"use client";

import { useSyncExternalStore } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { SettingRow, SettingSection } from "@/components/settings/setting-row";
import { DURATION_OPTIONS, type DurationValue } from "@/lib/licenses/expiration";
import {
  BATCH_QUANTITY_MAX,
  BATCH_QUANTITY_MIN,
  PAGE_SIZES,
  type PageSize,
} from "@/lib/licenses/types";
import {
  clearStoredPreferences,
  getDisplayServerSnapshot,
  getDisplaySnapshot,
  getGlobalDefaultsServerSnapshot,
  getGlobalDefaultsSnapshot,
  subscribePreferences,
  writeDisplayPreferences,
  writeGlobalDefaults,
  type DisplayPreferences,
  type ExpirationMode,
  type LicensePreferences,
} from "@/lib/preferences";

const MODE_LABELS: Record<ExpirationMode, string> = {
  permanent: "Never expires",
  duration: "Fixed duration",
  date: "Specific date",
};

export function PreferencesSettings() {
  // Storage is external mutable state, so it is subscribed to rather than
  // copied into component state. React renders the server snapshot during
  // hydration and swaps to the stored values immediately after, and a write
  // anywhere — including the reset below — re-renders this without any of it
  // being wired up by hand.
  const defaults = useSyncExternalStore(
    subscribePreferences,
    getGlobalDefaultsSnapshot,
    getGlobalDefaultsServerSnapshot,
  );
  const display = useSyncExternalStore(
    subscribePreferences,
    getDisplaySnapshot,
    getDisplayServerSnapshot,
  );

  function updateDefaults(patch: Partial<LicensePreferences>) {
    writeGlobalDefaults({ ...defaults, ...patch });
  }

  function updateDisplay(patch: Partial<DisplayPreferences>) {
    writeDisplayPreferences({ ...display, ...patch });
  }

  return (
    <>
      <SettingSection
        title="New license defaults"
        description="Applied to a product that has not issued a license yet. A product keeps whatever it was last used with."
      >
        <SettingRow label="Expiration" htmlFor="default-mode">
          <Select
            value={defaults.mode}
            onValueChange={(value) => updateDefaults({ mode: value as ExpirationMode })}
          >
            <SelectTrigger id="default-mode" className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(MODE_LABELS) as ExpirationMode[]).map((mode) => (
                <SelectItem key={mode} value={mode}>
                  {MODE_LABELS[mode]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingRow>

        {defaults.mode === "duration" ? (
          <SettingRow label="Duration" htmlFor="default-duration">
            <Select
              value={defaults.duration}
              onValueChange={(value) => updateDefaults({ duration: value as DurationValue })}
            >
              <SelectTrigger id="default-duration" className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DURATION_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </SettingRow>
        ) : null}

        <SettingRow label="Lock to device" hint="Binds each license to one machine.">
          <Switch
            checked={defaults.hwidLocked}
            onCheckedChange={(checked) => updateDefaults({ hwidLocked: checked })}
            aria-label="Lock new licenses to one device"
          />
        </SettingRow>

        <SettingRow
          label="Quantity"
          hint={`${BATCH_QUANTITY_MIN}–${BATCH_QUANTITY_MAX}`}
          htmlFor="default-quantity"
        >
          <Input
            id="default-quantity"
            type="number"
            inputMode="numeric"
            min={BATCH_QUANTITY_MIN}
            max={BATCH_QUANTITY_MAX}
            className="w-24"
            value={defaults.quantity}
            onChange={(event) => {
              const parsed = Number(event.target.value);
              if (Number.isNaN(parsed)) return;
              updateDefaults({
                quantity: Math.min(
                  Math.max(Math.trunc(parsed), BATCH_QUANTITY_MIN),
                  BATCH_QUANTITY_MAX,
                ),
              });
            }}
          />
        </SettingRow>
      </SettingSection>

      <SettingSection title="Display">
        <SettingRow label="Licenses per page" htmlFor="default-page-size">
          <Select
            value={String(display.pageSize)}
            onValueChange={(value) => updateDisplay({ pageSize: Number(value) as PageSize })}
          >
            <SelectTrigger id="default-page-size" className="w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZES.map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingRow>

        <SettingRow
          label="Show local time"
          hint="Adds your timezone beneath each UTC timestamp. UTC stays the primary reading."
        >
          <Switch
            checked={display.showLocalTime}
            onCheckedChange={(checked) => updateDisplay({ showLocalTime: checked })}
            aria-label="Show local time alongside UTC"
          />
        </SettingRow>
      </SettingSection>

      <SettingSection title="Stored data">
        <SettingRow
          label="Remembered settings"
          hint="Per-product creation settings and dismissed cards, kept in this browser."
        >
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm">
                Reset
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Reset remembered settings?</AlertDialogTitle>
                <AlertDialogDescription>
                  Clears creation settings for every product, these defaults, and any
                  dismissed onboarding card. No license or product is affected.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => {
                    // No local state to resync: the store notifies every
                    // subscriber, so this component and any other reading
                    // preferences both re-render on their own.
                    clearStoredPreferences();
                    toast.success("Remembered settings cleared");
                  }}
                >
                  Reset
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </SettingRow>
      </SettingSection>
    </>
  );
}
