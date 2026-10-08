# Sentriq Autonomous MVP Implementation Plan

> **Superseded:** This earlier plan included password authentication, OpenAI investigation, and Console work. The current focus is passwordless email verification + passkeys, Shield, Reclaim, Device Link, Access, and Northstar. Follow current product documentation instead of the historical checklist below.

> This plan supersedes the Stage A-only stopping point. Continue automatically through frontend, backend, tests, documentation, local commits and a safe non-forced push. Use the existing approved two-app pnpm architecture.

**Goal:** Build the complete local Sentriq/Northstar MVP with independently runnable web apps, a real security API, persistent PostgreSQL-compatible state, authenticated and policy-enforced protected actions, WebAuthn step-up, investigation, mocked OpenAI integration tests, documentation and verified Git delivery.

**Spec:** [2026-10-08-sentriq-mvp-architecture.md](../specs/2026-10-08-sentriq-mvp-architecture.md)

## Execution constraints

- The GitHub remote returned no refs during the audit. Never force-push. Recheck remote refs and authenticated access before push; publish a local `main` only if the remote is still empty or fast-forward safe.
- Run the two complete frontends before creating the database/API. Record a frontend-complete milestone, then continue into backend work without asking for approval.
- Use synthetic, development-only accounts and attack simulation; never commit passwords or generated keys. Refuse seed/simulation code paths in production.
- Use no live inference by default. Account model access may be checked with the existing environment credential only if the request is non-billable and the detected credential is available; never reveal it. Run inference only after explicit authorization. No alternative model without approval.
- Protected action execution requires a server-to-server Sentriq decision and valid action-bound verification. Fail closed on missing APIs/configuration/unknown decisions.
- Write tests first for security-sensitive behavior. Do not reduce security requirements to make a test pass.
- After each phase run the relevant tests/typechecks; record actual results in `docs/implementation-progress.md` and `.superpowers/sdd/2026-10-08-sentriq-mvp/progress.md`.

## Phases

### Task 0 — Phase 0: Repository audit and decisions

- [x] Inspect Git history, working tree, complete file inventory, task docs, remote refs, runtime, env template and test availability.
- [x] Record capability/status matrix in `docs/repository-audit.md`.
- [x] Select the approved web-app split plus independent Fastify security API, Drizzle/PGlite local database, SimpleWebAuthn and server-only SDK.
- [x] Add the full architecture spec, this plan, and a phase tracker; retain the Stage A design as historical UI guidance.

### Task 1 — Phase 1: Workspace contracts and independent frontend foundations

- [x] Pin workspace/runtime dependencies and scripts; generate `pnpm-lock.yaml`.
- [x] Implement strict shared Zod schemas, security events, action IDs, session/policy/step-up DTOs and typed SDK contracts.
- [x] Install packages and prove focused shared/SDK tests fail before implementation, then pass after implementation.
- [x] Create Next.js shells for `apps/sentriq-console` and `apps/demo-web`; keep the new backend directory absent until both apps are finished.

### Task 2 — Phase 2: Sentriq Console frontend

- [x] Marketing pages and responsive navigation.
- [x] Developer sign-in shell and complete console routes for overview, apps, policies, protected actions, events, sessions, recovery, integrations, AI investigation and settings.
- [x] Clearly labelled typed mock adapter for development-only UI workflows; forms, filters, dialogs, success/error/empty/loading states all function.
- [x] Console frontend tests, typecheck, production build, keyboard/responsive checks and visual screenshots.

### Task 3 — Phase 3: Northstar frontend

- [x] Accessible sample signup/login preview, recovery guidance, dashboard, profile, settings, sessions, export, account deletion, security verification and activity.
- [x] Separate Alice/Bob synthetic identities, clearly labelled replaceable demo adapter and user-scoped UI state.
- [x] Northstar frontend tests, typecheck, production build, keyboard/responsive checks and visual screenshots.
- [x] Mark and record the frontend-complete milestone; continue without an approval pause.

### Task 4 — Phase 4: Database and security API foundation

- [x] Add `apps/security-api`, Drizzle schema and versioned SQL migrations for tenants, applications, API keys, users, password credentials, WebAuthn credentials/challenges, sessions, policies, protected actions, one-time grants, resources, recovery codes/attempts, audit events and AI usage.
- [x] Add a local persistent PGlite DB factory, migration command, Fastify health route, structured redacted logging, request IDs, validation, rate limits and production-safe configuration.
- [x] Test migrations, constraints, app/tenant isolation and auth initialization using real PGlite; verify required migration checksums/schema and append-only audit protections at readiness. Focused tests 10/10 plus 4/4 review regressions; full suite 37/37; all workspace typechecks passed. Independent scoped re-review found no remaining actionable findings.

### Task 5 — Phase 5: Authentication, sessions and recovery

- [x] Password signup/login with Argon2id, generic failure responses, rate limits and safe cookies.
- [x] WebAuthn registration/authentication using SimpleWebAuthn v14, exact registered origin/RP validation, top-level-only ceremonies, user verification, multi-credential support, DB-backed expiry and atomic one-time challenge consumption.
- [x] Current-session/logout, expiry and revocation; authenticated routes verify persistent DB state.
- [x] One-time hashed recovery-code generation/consumption; recovery resets password, clears old passkeys, revokes sessions and records events. Recovery attempts are user/app/email-bound, expire after ten minutes and are consumed once.
- [x] Development-only demo seed generates developer/Alice/Bob credentials at runtime, refuses production and never checks credentials into source.
- [x] Negative tests: assertion/signature/origin/RP failures, cross-origin ceremony rejection, expired/replayed challenges, invalid/revoked sessions, brute-force throttles, recovery reuse, enumeration resistance, concurrent one-time state consumption, invalid-proof KDF avoidance, and expiry/code rotation during hashing.
- [x] Focused auth suite 34/34; serial root suite 71/71; all five workspace typechecks passed. Independent review found no actionable findings. Commits 74124a1, 62107ea, 4e16200.

### Task 6 — Phase 6: Deterministic policy, step-up and SDK enforcement

- [ ] Deterministic versioned evaluator with `ALLOW | STEP_UP | DENY`, reason codes, limited safe risk signals and fail-closed behavior.
- [ ] Server-side SDK with API-key scoping, timeout, correlation ID, response schemas, no retries and typed errors.
- [ ] Protected-action records for data export, account deletion, security setting changes and session revocation.
- [ ] Create short-lived user/session/action/resource-bound step-up flows; verify passkey/recovery proof; atomically consume grants during server policy evaluation.
- [ ] Northstar BFF owns profile/export/delete/session operations; it checks user ownership, calls Sentriq for every protected mutation, and executes only after a verified `ALLOW`.
- [ ] Tests attempt direct BFF bypass, API key mismatch, cross-user/tenant reads, unrelated/replayed grants, duplicate concurrent use, revoked sessions and unknown API outcomes.

### Task 7 — Phase 7: Events, Console integration, AI and controlled simulation

- [ ] Persist safe identity/policy/session/recovery events with tenant, app, actor/session, action, policy version, reason and correlation fields.
- [ ] Replace console mocks with server API via same-origin BFF; event/session/policy views filter server-side and enforce admin tenant scope.
- [ ] Implement dev-only suspicious-session event/signal endpoint; production rejects it. Prove resulting policy state and subsequent session revocation using DB state.
- [ ] Implement an OpenAI service boundary using the official SDK/Responses API, env-only config, bounded prompts/outputs, structured output schemas, sanitized event projections, dedupe, token/cost tracking, timeouts, per-user/app rate limits, and no retry loops.
- [ ] AI summaries/questions cite only retrieved event IDs and separate facts, inferences, missing evidence, and next steps; policy recommendations remain draft and require admin confirmation. No model tools can touch enforcement state.
- [ ] Mocked OpenAI tests cover response schemas, injection-like questions, invalid citations, timeout, rate limit, API failure and auth failure isolation. Keep live inference disabled without explicit authorization and verified account access.

### Task 8 — Phase 8: End-to-end scenario integration

- [ ] Replace Northstar UI mocks with BFF/server SDK calls and expose useful loading/network/recovery errors.
- [ ] Playwright virtual authenticator proves signup/enrollment/login and backend assertion verification.
- [ ] Demonstrate two Alice sessions, protected export step-up, successful export, suspicious event, investigation, revoke one session, rejected request from revoked session, surviving original session and Bob isolation.
- [ ] Test deletion, sensitive settings, recovery, direct request bypass, network outages and production-disabled demo endpoints.

### Task 9 — Phase 9: Security, accessibility, responsive and production verification

- [ ] Full typechecks/tests/builds and fresh migration boot.
- [ ] Run axe checks and keyboard-only tests over login/signup/passkey cancellation/step-up/recovery, Console investigation and responsive layouts at 375/768/1024/1440 plus landscape.
- [ ] Capture and inspect desktop/mobile screenshots for both applications.
- [ ] Inspect built browser bundles/maps for secrets and verify logs/errors redact credentials, cookie values and recovery data.
- [ ] Record manual screen-reader/real-hardware passkey checks that cannot be performed in the environment.
- [ ] Write startup/integration/security/developer/demo/deployment docs and an accurate limitations/security review.

### Task 10 — Phase 10: Delivery and final report

- [ ] `git diff --check`, secret scan, inspect complete diff and dependency lock; ensure no real env files or credentials are tracked.
- [ ] Commit implementation milestones with meaningful messages.
- [ ] Recheck remote and push with ordinary fast-forward only; if the remote gained history, fetch/rebase safely; if auth/access fails, preserve local commits and report exact error.
- [ ] Do not deploy/provision paid resources without credentials and authorization.
- [ ] Produce `SENTRIQ — FINAL MVP IMPLEMENTATION & SECURITY CERTIFICATION REPORT`, labeling implemented, tested, mocked, blocked and manually unverified items separately.
