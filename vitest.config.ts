import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/**/test/**/*.test.ts", "apps/web/test/**/*.test.ts"],
    globalSetup: ["./tests/global-setup.ts"],
    // Integration tests share one PostgreSQL test database — run files sequentially.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
    env: {
      NODE_ENV: "test",
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? "postgresql://edge:edge@localhost:54329/edge_erp_test",
      AUTH_SECRET: "test-secret-test-secret-test-secret-000000",
    },
  },
});
