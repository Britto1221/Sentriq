# Trusted-server policy and step-up contract

This is a self-hosted Northstar reference contract. Calls use the application API key and, for authenticated operations, the opaque session token in `x-sentriq-api-key` and `x-sentriq-session-token`. These credentials must stay in a trusted server route. Request/response schemas are defined in `@sentriq/shared`; the server-only `@sentriq/sdk` validates them and applies a bounded timeout without retries.

## Deterministic evaluation

`POST /v1/evaluations` accepts `{ applicationId, userId, sessionId, actionId, resourceId, stepUpGrantId? }`. The API derives the user and session from the server-held session token, checks the application key scope and verifies resource ownership. Caller assertions such as `verified` and unknown properties are rejected. Policy modes are only `ALLOW`, `STEP_UP`, and `DENY`; unknown/disabled/missing policy and database errors fail closed.

The newest persisted policy version is authoritative. `DENY` cannot be overridden. `STEP_UP` returns a random challenge ID bound to the account, session, action, resource, tenant/application and policy version. An authorized app server must still execute its own operation only after the final policy decision is `ALLOW`.

## Fresh passkey verification

1. `POST /v1/step-up/options` requires the same live user session, challenge and registered origin/RP snapshot. It returns WebAuthn authentication options with required user verification.
2. The browser obtains a fresh assertion. `POST /v1/step-up/verify` verifies the single-use challenge, origin, RP ID, signature, credential ownership, user-verification result and live session with SimpleWebAuthn.
3. A valid response issues a short-lived random grant; only its digest is persisted.
4. The server re-evaluates the exact action/resource with that grant. The API atomically consumes it once. Expired, stale, replayed, cross-user/session/resource/action grants fail.

Reclaim recovery codes are not accepted by Shield. Missing security service or policy approval must not execute a protected operation.

## Audit and migration note

Persisted events record explicit policy mode/version, a safe reason code and a correlation ID. Public response/event schemas omit legacy risk-score/signal fields. Historical migrations retain obsolete database columns for compatibility/data preservation, but the active policy engine does not calculate or use risk scores, behavioral signals or simulation state. Migration `0007` converts old contextual policies to the explicit `STEP_UP` mode; new policy writes reject old modes.

## Verification boundaries

Tests exercise PGlite transactions and generated cryptographic WebAuthn assertions through the actual verifier. They do not prove production database isolation, multi-instance rate limits, host authorization correctness beyond Northstar, or real authenticator hardware. An `ALLOW` is an API decision, not an atomic transaction across Sentriq and a host application's database.
