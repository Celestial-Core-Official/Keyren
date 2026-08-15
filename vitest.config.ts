import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Provides ambient env vars so modules importing "@/env" don't throw
    // during test collection (see tests/setup.ts).
    setupFiles: ["tests/setup.ts"],
    // PGlite instances are per-file; running files in parallel is safe
    // but each file must create its own database.
    pool: "forks",
    testTimeout: 30_000,
  },
  resolve: {
    alias: { "@": resolve(__dirname, "./src") },
  },
});
