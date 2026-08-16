import { useSyncExternalStore } from "react";

/**
 * False during the server render and through hydration, true afterwards.
 *
 * The usual `useState(false)` plus `useEffect(() => setMounted(true))` does the
 * same job, but sets state from an effect purely to learn something React
 * already knows. `useSyncExternalStore` asks the question directly: the server
 * snapshot is false, the client snapshot is true, and React re-renders once
 * hydration is done.
 *
 * The subscribe function is a no-op because the answer never changes after
 * that first transition — there is nothing to be notified about.
 */
const subscribe = () => () => {};
const getSnapshot = () => true;
const getServerSnapshot = () => false;

export function useHydrated(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
