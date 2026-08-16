import { useSyncExternalStore } from "react";
import {
  DEFAULT_DISPLAY_PREFERENCES,
  getDisplaySnapshot,
  readUiFlag,
  subscribePreferences,
  type DisplayPreferences,
} from "@/lib/preferences";

/**
 * React's view of the preference store.
 *
 * `localStorage` is external mutable state that the server cannot see, so a
 * component must not read it while rendering — a lazy `useState` initializer
 * runs during the server render (where storage is absent) and again during
 * hydration (where it is not), and React discards the server HTML for the
 * whole root when the two disagree. The visible symptom lands nowhere near the
 * component that caused it.
 *
 * `useSyncExternalStore` is the sanctioned answer: React renders the server
 * snapshot during hydration, so the first client render matches by
 * construction, then re-renders once with the stored value. Every writer in
 * `preferences.ts` notifies this store, so a change made anywhere — including
 * the reset button in Settings — reaches every reader without being wired up
 * by hand.
 */

/**
 * A dismissed card, a copied snippet — a one-off boolean the database has no
 * way to observe.
 *
 * The server snapshot is `false` for every flag, which is the right way round:
 * a card that appears and then disappears is better than one that is missing
 * and then appears.
 */
export function useUiFlag(key: string): boolean {
  return useSyncExternalStore(
    subscribePreferences,
    () => readUiFlag(key),
    () => false,
  );
}

/** Page size and local-time preferences, as the developer set them. */
export function useDisplayPreferences(): DisplayPreferences {
  return useSyncExternalStore(
    subscribePreferences,
    getDisplaySnapshot,
    // Referentially stable, because `useSyncExternalStore` compares snapshots
    // by identity and a fresh literal here would re-render forever.
    () => DEFAULT_DISPLAY_PREFERENCES,
  );
}
