import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@electric-sql/pglite": resolve("apps/security-api/node_modules/@electric-sql/pglite/dist/index.js"),
      "@sentriq/core": resolve("packages/core/dist/index.js"),
      "@simplewebauthn/server": resolve("apps/security-api/node_modules/@simplewebauthn/server/esm/index.js"),
    },
  },
  test: { include: ["apps/sdk-integration-test/src/host-storage.test.ts"], environment: "node", testTimeout: 30_000 },
});
