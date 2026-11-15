import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    testTimeout: 60000,
    hookTimeout: 90000,
    pool: "forks",
    poolOptions: {
      forks: {
        singleFork: true, // Critical: prevents parallel test runs competing for MongoDB state
      },
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: ["tests/**", "scripts/**", "dist/**"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
