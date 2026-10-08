import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@simplewebauthn/server": resolve("apps/security-api/node_modules/@simplewebauthn/server/esm/index.js"),
    },
  },
  test: {
    include: ["packages/core/src/passkey-server.test.ts"],
    environment: "node",
  },
});
