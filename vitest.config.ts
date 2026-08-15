import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // PGlite instances are per-file; running files in parallel is safe
    // but each file must create its own database.
    pool: "forks",
    testTimeout: 30_000,
  },
  resolve: {
    alias: { "@": resolve(__dirname, "./src") },
  },
});
