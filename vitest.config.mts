import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

const alias = { "@": resolve(import.meta.dirname, "./src") };

/**
 * Two projects rather than one.
 *
 * The service and crypto suites need a real Node runtime (`node:crypto`,
 * PGlite) and would only pay for a DOM they never touch. The component suites
 * need a DOM. Splitting them keeps the database tests as fast as they were in
 * Alpha_v1 while letting `.test.tsx` files render React.
 */
export default defineConfig({
  test: {
    // PGlite instances are per-file; running files in parallel is safe
    // but each file must create its own database.
    pool: "forks",
    testTimeout: 30_000,
    // Bootstrapping a PGlite instance and replaying every migration happens
    // inside `beforeAll`, and under a parallel run it regularly exceeds
    // Vitest's 10s hook default on a loaded machine. The work is legitimate,
    // so it gets the same budget as a test rather than a flaky failure.
    hookTimeout: 30_000,

    projects: [
      {
        resolve: { alias },
        test: {
          name: "node",
          environment: "node",
          include: ["tests/**/*.test.ts"],
          // Provides ambient env vars so modules importing "@/env" don't throw
          // during test collection (see tests/setup.ts).
          setupFiles: ["tests/setup.ts"],
          pool: "forks",
          testTimeout: 30_000,
          hookTimeout: 30_000,
        },
      },
      {
        resolve: { alias },
        test: {
          name: "dom",
          environment: "happy-dom",
          include: ["tests/**/*.test.tsx"],
          setupFiles: ["tests/setup.ts", "tests/setup-dom.ts"],
          testTimeout: 30_000,
          hookTimeout: 30_000,
        },
      },
    ],
  },
});
