"use client";

import { useClerk } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { SettingRow, SettingSection } from "@/components/settings/setting-row";

/**
 * Account controls that open Clerk's own UI.
 *
 * The reasoning the old page spent two paragraphs on still holds — Keyren must
 * not reimplement password or session management, because two places to change
 * a password is one place too many. What changed is that it now acts on that
 * reasoning instead of explaining it: these open Clerk directly rather than
 * describing where to find the avatar menu.
 */
export function AccountActions() {
  const { openUserProfile, signOut } = useClerk();

  return (
    <SettingSection title="Account">
      <SettingRow label="Profile" hint="Email, username and connected sign-in methods.">
        <Button variant="outline" size="sm" onClick={() => openUserProfile()}>
          Open
        </Button>
      </SettingRow>

      <SettingRow label="Security" hint="Password, two-factor and active devices.">
        {/* `__experimental_startPath` is exactly as provisional as its name.
            If Clerk drops it, this opens the profile at its default page
            instead of the security tab — one extra click, not a broken
            button — so it is not worth guarding against. */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => openUserProfile({ __experimental_startPath: "/security" })}
        >
          Open
        </Button>
      </SettingRow>

      <SettingRow label="Sign out">
        <Button variant="outline" size="sm" onClick={() => signOut({ redirectUrl: "/" })}>
          Sign out
        </Button>
      </SettingRow>
    </SettingSection>
  );
}
