import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

/**
 * Testing Library only auto-registers its own cleanup when Vitest runs with
 * `globals: true`. This project does not, so unmounting is wired up
 * explicitly — without it, every rendered component would accumulate in the
 * document and queries would match stale trees from previous tests.
 */
afterEach(() => {
  cleanup();
});
