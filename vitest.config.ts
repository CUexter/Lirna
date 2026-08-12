import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Colocated unit tests (client/server) run fast and in-process; integration and
// e2e suites live under tests/ and touch real resources, so they run serially
// with generous timeouts. The bright line is location: a test's folder declares
// what it is allowed to touch (see docs — unit = zero real I/O).
const clientAlias = {
  "@": fileURLToPath(new URL("./client/src", import.meta.url)),
};

export default defineConfig({
  test: {
    // Serialize suites: integration/e2e share host resources (Postgres, ports,
    // a browser). Unit tests are fast enough that global serialization is cheap.
    fileParallelism: false,
    projects: [
      {
        plugins: [react()],
        resolve: { alias: clientAlias },
        test: {
          name: "unit",
          globals: true,
          environment: "node",
          setupFiles: ["./client/vitest.setup.ts"],
          include: [
            "client/src/**/*.test.{ts,tsx}",
            "server/**/*.test.ts",
          ],
        },
      },
      {
        test: {
          name: "integration",
          globals: true,
          environment: "node",
          include: ["tests/integration/**/*.test.ts"],
          hookTimeout: 60_000,
          testTimeout: 60_000,
        },
      },
      {
        test: {
          name: "e2e",
          globals: true,
          environment: "node",
          include: ["tests/e2e/**/*.test.ts"],
          hookTimeout: 60_000,
          testTimeout: 60_000,
        },
      },
      {
        // The Phase 0 gate: one consolidated body of evidence driven through the
        // application scenario seam against disposable real infrastructure.
        test: {
          name: "gate",
          globals: true,
          environment: "node",
          include: ["tests/gate/**/*.test.ts"],
          hookTimeout: 120_000,
          testTimeout: 120_000,
        },
      },
    ],
  },
});
