# Sentriq Autonomous MVP Architecture

> **Superseded:** This earlier architecture included passwords, OpenAI investigation, and Console scope. The current product scope is the focused passwordless SDK/Northstar implementation documented in `README.md`, `docs/passkey-authentication.md`, and `docs/repository-audit.md`. Do not use this historical spec to implement password routes or model-backed threat decisions.

**Status:** Approved for implementation by the user on 2026-10-08. This specification supersedes the Stage A-only scope and frontend stop gate in `2026-10-08-sentriq-stage-a-design.md`; its visual direction and two-app split remain in force.

## Goal

Deliver a locally runnable, database-backed Sentriq MVP with two distinct web applications, real account authentication, server-enforced policies, action-bound step-up verification, useful security investigations, and repeatable tests. The local demo uses synthetic development accounts and simulated attack signals; it must label the controlled simulation clearly and must not present mock provider results as live OpenAI output.

## Repository audit basis

`docs/repository-audit.md` records that the local history contains only task-created documentation, the configured GitHub remote returns no refs, and there was no existing product source, database, authentication system, or test suite to preserve. The implementation starts from the already approved two-app pnpm workspace and adds the independently deployed security API required by the new master prompt.

## System boundaries

```text
apps/sentriq-console (Next.js BFF + Sentriq marketing/console)
       │ server-only @sentriq/sdk
       ▼
apps/security-api (Fastify API + deterministic policy + identity)
       │ Drizzle migrations / PGlite (embedded PostgreSQL)
       ▼
apps/demo-web (Next.js BFF + Northstar Workspace)
       │ server-only @sentriq/sdk
       └──────────────────────────────► security API

packages/shared (Zod schemas, event/action identifiers, DTOs)
packages/sdk    (typed server-only API client)
```

- `apps/sentriq-console` owns marketing pages, developer authentication, application registration, admin workflows, audit views, and the investigator UI. Server route handlers call the security API; browser code never receives the Sentriq application secret.
- `apps/demo-web` owns Northstar's user interface and same-origin BFF routes. Its server verifies the current app session and calls Sentriq through the SDK before it performs a protected resource operation.
- `apps/security-api` is the authority for user/password/passkey credentials, sessions, API-key authentication, tenant/app scope, event persistence, deterministic risk/policy decisions, action-bound challenges/grants, and AI investigation requests. An unavailable API or unknown policy result fails closed for protected actions.
- `packages/shared` defines runtime schemas and types shared across process boundaries. `packages/sdk` is a server-only HTTP client with request validation, a bounded timeout, correlation IDs, no automatic retry, and an application-scoped API key.
- The local database is PGlite, PostgreSQL compiled to WebAssembly, stored under an ignored data directory. Drizzle schema and versioned SQL migrations are used for local runs, tests, and deployment. One security API process owns the local database. PGlite deployments require a persistent volume and a single writer/replica; horizontal scaling and shared multi-process access are explicitly unsupported by this MVP.
- A deployment blueprint is configuration only. Do not provision paid services or deploy without available credentials and explicit user authorization.

## Selected implementation stack

Versions were checked against the official documentation or npm registry on 2026-10-08. Pin exact versions in the lockfile and re-check peer/runtime compatibility during installation.

| Layer | Selection |
|---|---|
| Web applications | Next.js 16.4.0 App Router, React/React DOM 19.3.0, strict TypeScript |
| Security API | Fastify 5.12.5 with Zod request contracts and explicit authorization hooks |
| Persistence | Drizzle ORM 0.45.3, Drizzle Kit, PGlite 0.5.8 |
| Passwords | `argon2` 0.45.1 using Argon2id defaults and explicit rehash-safe verification |
| Passkeys | `@simplewebauthn/server` 14.0.3 and browser package after peer/version verification |
| AI | Official `openai` SDK 7.30.0, Responses API, strict structured output, mocked provider tests |
| Tests | Vitest 5.0.3 and Playwright 1.64.0, plus axe-core for browser accessibility checks |
| UI | Separate Sentriq dark operations-console and Northstar light account-workspace styles; semantic HTML, local/system font stacks, reduced motion, visible focus |

The lack of Docker and `psql` on the execution host was verified. PGlite avoids making those local prerequisites while preserving PostgreSQL SQL semantics. The single-process/volume limitation is a known tradeoff, not a production scalability claim.

## Identity, sessions, and recovery

- User passwords are accepted only over HTTPS in deployment, hashed with Argon2id, rate limited, and never logged. Password authentication remains an accessible fallback to passkeys. Passwords are not checked into fixtures, docs, screenshots, environment templates, or Git history.
- A development-only seed command creates `developer@sentriq.test`, `alice@northstar.test`, and `bob@northstar.test` if absent. It generates random bootstrap credentials at runtime, never commits them, refuses production, and does not reset an existing account.
- Passkeys use SimpleWebAuthn registration and assertion verification. Persist credential ID, public key, counter/device metadata and owner; private keys remain with the authenticator. Store each server challenge in the database with user/app/session/action context and expiry. Atomically consume it before accepting the verification result; replay or expired challenges fail. Exact registered application origins and RP ID are checked server-side. Require user verification for login and step-up.
- Sessions use a cryptographically random opaque cookie token. Persist only its SHA-256 digest, bind it to user, tenant, app, issue/expiry/revocation, rotate on authentication/recovery, and reject revoked/expired sessions on every backend request. Cookies are HttpOnly, SameSite=Lax, Path=/, and Secure outside local HTTP development. Mutating BFF routes check same-origin requests; security API credentials are never browser-readable.
- Recovery uses high-entropy, one-time recovery codes created after fresh verification. Store only salted/keyed one-way verifiers. Recovery start returns the same public response for existing and missing accounts. Completion consumes one code atomically, changes password, removes old passkeys, revokes all old sessions, records an event, and requires new authenticator enrollment. Email-only recovery is not provided because no verified delivery service exists.

## Authorization and protected actions

- The security API derives tenant and application scope from the authenticated server-side API key/session, never from a client-supplied tenant ID.
- A deterministic policy engine owns `ALLOW`, `STEP_UP`, and `DENY`, policy version, risk signals, and safe decision reason. Missing signals do not bypass mandatory authentication/action rules. Accessibility settings, browser characteristics, and assistive technology are not risk signals.
- `STEP_UP` creates a short-lived challenge bound to the user, session, application, registered action and resource. Passkey verification or a one-use recovery code produces an action-bound one-time grant. The policy evaluation transaction consumes the grant exactly once. The server SDK returns `ALLOW` only after backend checks; Northstar's BFF executes the protected operation only after that response. Replaying a grant or submitting direct requests without the API key, valid session and policy check cannot authorize an operation.
- Northstar account/resource reads are scoped to the authenticated user. Admin endpoints require a developer/admin session and tenant scope. Event queries apply tenant/application filters before returning data.
- Abuse controls cover password/passkey/recovery/AI endpoints. Local rate-limit storage is process-local and the service is designed to run as one API instance in this MVP.

## Events and investigation

Security events are append-only rows containing a random event ID, timestamp, tenant, app, subject where known, session correlation, action, result, policy version, and bounded reason code. Do not persist passwords, credential private data, raw cookie/API tokens, recovery codes, or raw challenge values in logs. Keep the recovery code verifier separate from event records.

Investigation inputs are loaded from tenant-scoped database records. OpenAI receives only a minimal, sanitized event projection and a bounded investigator question; it does not receive secrets, authentication tokens, full IP/device fingerprints, or arbitrary database access. Structured AI output is validated and cited event IDs must be a subset of the selected records. Every response separates observed facts, inferences, missing evidence, and next steps. AI never computes the authoritative risk score, changes a decision, revokes/creates sessions, or activates policies. Policy suggestions remain draft until an authorized administrator reviews and confirms them through deterministic server validation.

OpenAI configuration is server-only: `OPENAI_API_KEY`, `OPENAI_MODEL`, and `OPENAI_MAX_OUTPUT_TOKENS`. Official OpenAI model documentation currently lists GPT-6 Luna with API identifier `gpt-6-luna` and supports the Responses API. This public identifier does not prove that the detected account key can access it. Before any inference, the service must require a configured model and account-access verification. If account verification cannot be performed without unapproved billing or credential access is denied, inference stays disabled and mocked-provider tests cover the integration. Do not substitute a model.

AI requests set a strict output budget and timeout, do not auto-retry, record token usage and a dated/configurable cost estimate, deduplicate identical requests, and rate-limit by user and application. AI errors fail independently and never alter authentication or authorization behavior.

## User experience and accessible authentication

- Reuse the visual direction in the earlier design document: Sentriq stays dark and evidence-focused; Northstar stays light and calm.
- Login, signup, passkey enrollment/authentication, step-up, recovery and error states are keyboard-operable and screen-reader announced. Support password managers, paste, visible labels, understandable instructions, visible focus, accessible validation, responsive zoom, sufficient contrast and reduced motion.
- No CAPTCHA, image puzzle, assistive-tech detection, or accessibility-specific weakened policy. Password entry is the fallback where WebAuthn is unavailable or canceled. Recovery-code copy/paste is the second fallback for step-up/recovery.
- Use English for all implemented authentication journeys. Do not claim Tamil support unless the complete journey is translated and reviewed.
- All development identities, seeded fixture data, attack simulations, and non-live AI examples are visibly labeled as development/synthetic. Production cannot use seed/demo/simulation endpoints.

## Demonstration flow

1. Seed local users and Northstar app registration using runtime-generated development credentials.
2. Log into Sentriq as developer and confirm the Northstar app/policy.
3. Log into Northstar as Alice, register a passkey, and use normal account pages.
4. Create an independent second browser session and passkey/login as Alice.
5. Export data; the Northstar server calls Sentriq, gets `STEP_UP`, verifies a real test/browser passkey or one-use recovery code, consumes the action-bound grant, and returns the synthetic export.
6. Trigger the dev-only suspicious-session simulator; it writes a labeled signal/event and obtains a deterministic challenged decision.
7. Review the timeline in the Console and request an AI summary. Use the real Responses API only after separate live-usage authorization and model/account verification; otherwise exercise the same route with the mock provider.
8. Revoke the suspicious session in Console. Send another request from that session and prove it is rejected while Alice's original session remains active.
9. Log in as Bob and prove Bob cannot read Alice's profile, export or session details.

## Acceptance and limitations

Run exact package typechecks, unit/integration/security tests, builds, Playwright browser scenarios, keyboard and responsive checks, API failure tests and secret-bundle inspection. Report mocked vs live evidence separately. Human screen-reader and real-device passkey verification are recorded as manual checks when unavailable. The MVP is not production-certified: PGlite is single-writer, local rate limits are process-local, there is no email/SMS recovery channel, and hosted deployment requires user-controlled persistent storage/secrets and explicit authorization.
