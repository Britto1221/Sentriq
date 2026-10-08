# Sentriq architecture

Sentriq is a self-hostable TypeScript project demonstrated through Northstar. The active workspace has two applications and three shared packages:

```text
apps/security-api   Fastify reference security/authentication API
apps/demo-web       Northstar Next.js reference application and same-origin BFF
packages/shared     Zod schemas, action IDs, and safe event types
packages/sdk        Server-only typed Sentriq API client
packages/access     English/Tamil React access components, catalogs and speech guidance
```

The former marketing/developer Console is preserved outside the active workspace at `archive/legacy-sentriq-console`. It is not a supported administration API or part of the SDK vertical slice.

## Trust boundaries

- Browser JavaScript receives ceremony options and submits WebAuthn responses. It never receives the application API key or raw server session token.
- Northstar's same-origin server routes hold the app key and session cookie, validate origin and body size, then call the security API.
- The security API derives tenant/application/user/session identity from its opaque credentials and database. Caller-supplied identity fields are checked against that context.
- SimpleWebAuthn verifies registration and assertion challenges, origin, RP ID, signatures and user verification. Sentriq never receives private keys or biometric data.
- Policy evaluation is deterministic. AI or conversational guidance cannot authenticate, authorize, issue sessions, or alter a policy.
- Northstar owns its account resources and performs the protected resource operation after the security service permits it. In this demo implementation the security API still stores Northstar's demo identities and sessions; a host-owned identity/session storage adapter is not yet complete.

## Flows

### Passkey

1. The browser requests an options object from a same-origin BFF.
2. The BFF forwards using the server-held application key; the API creates a random, expiring, single-use challenge bound to account/application/origin/RP context.
3. `@simplewebauthn/browser` calls the WebAuthn browser API.
4. The server API verifies the credential response through `@simplewebauthn/server` and only then stores a public credential or creates a session.

### Action Shield

The protected Northstar backend loads the authenticated session, asks the server API to evaluate an action/resource, obtains a fresh WebAuthn assertion when `STEP_UP` is returned, and requests a final deterministic decision. It executes the operation only on `ALLOW`. Grants are short lived, action/resource/user/session scoped, and atomically consumed. The frontend prompt is not an enforcement boundary.

### Reclaim

Recovery code verification atomically consumes one one-way verifier and creates a ten-minute restricted transaction. That transaction can only issue and complete a replacement-passkey ceremony. Successful replacement revokes old credentials and sessions, invalidates old codes, stores the new verified public credential, and returns six new recovery codes once. It creates no authenticated session. Recovery codes do not satisfy Shield.

### Recovery guide

Northstar classifies a user's local text with deterministic English/Tamil rules. It stores only a fixed response key and route in component state; user text is not rendered into history, sent to a server, logged, or saved. The guide can link only to sign-in or the secure recovery form. It is labeled as rule-based guidance with no AI model connected.

## Storage and runtime

The Fastify reference API uses PGlite/Drizzle with checksummed immutable SQL migrations and a single-writer data directory. It is useful for reproducible local demonstration. It is not a multi-process or managed production PostgreSQL deployment. Do not share the same PGlite directory among writers. Production mode requires an absolute persistent directory and an operator-configured TLS-terminating proxy; it does not provision infrastructure.
