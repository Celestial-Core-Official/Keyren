"use client";

import { useTheme } from "next-themes";
import { Monitor, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { useHydrated } from "@/lib/use-hydrated";
import { SettingRow, SettingSection } from "@/components/settings/setting-row";

const OPTIONS = [
  { value: "system", label: "System", icon: Monitor },
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
] as const;

export function AppearanceSetting() {
  const { theme, setTheme } = useTheme();

  // The server cannot know the stored theme, so the first client render must
  // match the server's — otherwise React discards the markup. Until hydrated,
  // no option is marked selected rather than the wrong one being.
  const hydrated = useHydrated();

  return (
    <SettingSection title="Appearance">
      <SettingRow label="Theme">
        <div
          role="radiogroup"
          aria-label="Theme"
          className="inline-flex rounded-lg border border-border p-0.5"
        >
          {OPTIONS.map((option) => {
            const Icon = option.icon;
            const selected = hydrated && theme === option.value;

            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setTheme(option.value)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm transition-colors",
                  "focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                  selected
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="size-3.5" />
                {option.label}
              </button>
            );
          })}
        </div>
      </SettingRow>
    </SettingSection>
  );
}
