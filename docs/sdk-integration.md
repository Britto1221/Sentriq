# SDK integration

The workspace currently exposes `@sentriq/shared`, `@sentriq/sdk` and `@sentriq/access`. Northstar is the working reference integration. These packages are workspace imports; they are not published to npm.

## Trusted server usage

```ts
import { createSentriq } from "@sentriq/sdk";

const sentriq = createSentriq({
  baseUrl: process.env.SENTRIQ_API_BASE_URL!,
  applicationId: process.env.SENTRIQ_APPLICATION_ID!,
  apiKey: process.env.SENTRIQ_APPLICATION_KEY!,
  timeoutMs: 3_000,
});

const result = await sentriq.evaluate({
  applicationId: "development-northstar",
  userId: authenticatedUser.id,
  sessionId: authenticatedSession.id,
  actionId: "data.export",
  resourceId: ownedAccountResourceId,
}, serverHeldSessionToken);
```

Create and use the client only in a server route. The API key must never appear in browser bundles. Host server code must derive identity from its own trusted session boundary, enforce resource ownership, and execute the operation only after a final `ALLOW`.

The current SDK surface provides typed evaluation, step-up options/verification, Reclaim operations and owner-scoped security event reads. Northstar's BFF performs auth route requests and keeps the API key/session in server configuration and HttpOnly cookies. The SDK does not yet implement an injectable host-owned credential/session storage adapter, a standalone `@sentriq/core`, or published Next.js helpers/components. The API currently owns Northstar demo users and sessions; treat the project as a working reference backend plus SDK client, not as a fully storage-agnostic SDK release.

## Local workspace development

See the root README for environment setup. To use these packages in a new host app today, run the security API as a self-hosted service and write trusted server routes similar to Northstar's `src/server` handlers. Do not call policy or auth APIs directly from a browser.
