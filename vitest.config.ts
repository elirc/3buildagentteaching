import { defineConfig } from "vitest/config";

/**
 * Two test projects, run separately.
 *
 *   unit         pure functions. No database, no server. ~15s.
 *   integration  real services against a real Postgres. Needs docker.
 *
 * They are split rather than merged because they answer different questions and
 * have wildly different costs. `npm test` must stay fast enough that people run
 * it constantly; the integration suite needs a container and is run before a
 * push and in CI.
 *
 * Note `fileParallelism: false` on the integration project. The suite truncates
 * shared tables between files, so two files running concurrently would delete
 * each other's fixtures — a failure that looks like flakiness and is actually a
 * design error.
 */
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          include: ["packages/*/src/**/*.test.ts", "apps/web/lib/**/*.test.ts"],
          exclude: ["**/*.integration.test.ts", "**/node_modules/**"]
        }
      },
      {
        test: {
          name: "integration",
          include: ["packages/application/src/__tests__/**/*.integration.test.ts"],
          globalSetup: ["./packages/application/src/__tests__/global-setup.ts"],
          setupFiles: ["./packages/application/src/__tests__/setup.ts"],
          fileParallelism: false,
          hookTimeout: 180_000,
          testTimeout: 60_000
        }
      }
    ]
  }
});
