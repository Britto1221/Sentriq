# Sentriq Stage A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete, verify, commit and push the Sentriq marketing/console frontend and the independently runnable Northstar Workspace frontend, then stop for user review.

**Architecture:** A pnpm workspace contains `apps/sentriq-console`, `apps/demo-web`, `packages/shared` and a type-only `packages/sdk`. Each app owns its visual identity and a local mock adapter; shared contracts are the only common runtime dependency. There is no backend or live AI integration in Stage A.

**Tech Stack:** pnpm `12.10.1` workspaces; Next.js App Router; React; strict TypeScript; Tailwind CSS; Zod; Vitest; Playwright; semantic HTML; Lucide SVG icons. Use the current stable compatible versions for application dependencies and commit the resulting lockfile.

**Spec:** [2026-10-08-sentriq-stage-a-design.md](../specs/2026-10-08-sentriq-stage-a-design.md)

## Global Constraints

- Node.js must be at least `22.13.0` to install pnpm 12 and at least `22.12.0` for the current Vitest release; the host reports `v24.11.0`.
- Pin the project package manager as `"packageManager": "pnpm@12.10.1"`; the official release page lists 12.10.1 on 2026-10-06.
- Run Sentriq Console on port `3000` and Northstar on port `3001`.
- Both apps use clearly labeled synthetic sample data and local demo adapters only.
- The developer, Alice and Bob demo account selectors are disabled in production builds.
- No Stage A route may send an OpenAI request or contain an API key; keep `OPENAI_MODEL=` blank.
- AI-style mock output cites existing selected event IDs and separates recorded facts, inference, missing evidence and next steps.
- Risk scores and policy decisions come from fixtures; mock explanations cannot calculate or change them.
- AI policy suggestions remain drafts until explicit local demo confirmation.
- Never represent browser-only mock behavior as authentication, authorization, verification or production enforcement.
- Never force-push; fetch `origin/main` immediately before pushing and preserve any remote commits.

## Review Focus

- Unknown action identifier or malformed origin → shared validation rejects it before saving (`packages/shared` contract tests).
- Event history lacks a requested fact → investigator reports missing evidence and cites only present IDs (`mock-investigator.test.ts`).
- A policy suggestion has not been confirmed → status stays draft and active policy state is unchanged (`mock-console-adapter.test.ts`).
- A user opens a demo-only route in production → demo identity selection is unavailable (`demo-access.test.ts` in both apps).
- A narrow viewport or open dialog hides content/focus → responsive and keyboard Playwright checks fail (`frontend-quality.spec.ts`).

---

### Task 1: Workspace, shared contracts and SDK boundary

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.gitignore`, `.env.example`, `vitest.config.ts`
- Create: `packages/shared/package.json`, `packages/shared/tsconfig.json`, `packages/shared/src/action-identifiers.ts`, `packages/shared/src/contracts.ts`, `packages/shared/src/index.ts`, `packages/shared/src/contracts.test.ts`
- Create: `packages/sdk/package.json`, `packages/sdk/tsconfig.json`, `packages/sdk/src/index.ts`, `packages/sdk/src/index.test.ts`

**Interfaces:**
- Produces: action identifier tuple; Zod schemas and inferred types for applications, protected actions, policies, policy suggestions, security events, session summaries and investigator answers; type-only SDK `SentriqClient`, evaluation input and `ALLOW | STEP_UP | DENY` result.
- Consumes: none.

- [ ] **Step 1: Write shared contract and SDK type tests** for the six required action identifiers, valid/invalid application origins and names, supported policy modes, draft-only policy suggestions, required evaluation input fields and the exact three decision values.
- [ ] **Step 2: Run the focused test and verify it fails** because the package and exports do not exist.

  Run: `pnpm --filter @sentriq/shared test`

  Expected: FAIL with unresolved package/test imports.
- [ ] **Step 3: Implement the smallest contract surface** in `packages/shared`; validate HTTPS origins and localhost-only HTTP origins, and infer TypeScript types from Zod schemas.
- [ ] **Step 4: Re-run shared and SDK tests** and confirm type assertions reject missing required input and decision values outside the three-value union.
- [ ] **Step 5: Run package typechecks** and verify `.env.local` is ignored while `.env.example` is trackable.
- [ ] **Step 6: Commit** as `feat(shared): add Stage A contracts and SDK types`.

### Task 2: App foundations and design systems

**Files:**
- Create: `apps/sentriq-console/package.json`, `apps/sentriq-console/next.config.ts`, `apps/sentriq-console/tsconfig.json`, `apps/sentriq-console/postcss.config.mjs`, `apps/sentriq-console/src/app/layout.tsx`, `apps/sentriq-console/src/app/globals.css`, `apps/sentriq-console/src/app/page.tsx`
- Create: `apps/demo-web/package.json`, `apps/demo-web/next.config.ts`, `apps/demo-web/tsconfig.json`, `apps/demo-web/postcss.config.mjs`, `apps/demo-web/src/app/layout.tsx`, `apps/demo-web/src/app/globals.css`, `apps/demo-web/src/app/page.tsx`
- Create: `playwright.config.ts`, `e2e/app-shells.spec.ts`
- Modify: root `package.json`, workspace config and lockfile
- Create: `apps/sentriq-console/src/components/`, `apps/demo-web/src/components/`

**Interfaces:**
- Consumes: shared package schemas/types from Task 1.
- Produces: independent dev/build/typecheck/test commands and visual token systems; no cross-app CSS or runtime imports.

- [ ] **Step 1: Create only the two app manifests, root layouts/global styles and minimal app scripts; resolve dependencies and add a Playwright config** that starts ports 3000 and 3001. Leave both root page files absent.
- [ ] **Step 2: Write root-route tests** asserting each app names itself and displays the development-only sample-data banner.
- [ ] **Step 3: Run the smoke tests and verify the expected failures** because the two root pages are missing.
- [ ] **Step 4: Implement the two root pages and independent App Router shells** with navigation containers, responsive breakpoints and semantic tokens from the design spec.
- [ ] **Step 5: Add root workspace scripts** `dev:console`, `dev:demo`, `build`, `typecheck`, `test` and `test:e2e`; use workspace protocol dependencies for local packages.
- [ ] **Step 6: Run both root-route smoke tests, typechecks and production builds.**
- [ ] **Step 7: Commit** as `feat: establish Sentriq and Northstar app shells`.

### Task 3: Sentriq marketing site and local developer access

**Files:**
- Create: `apps/sentriq-console/src/app/page.tsx`, `features/page.tsx`, `developers/page.tsx`, `security/page.tsx`, `pricing/page.tsx`, `login/page.tsx`, `signup/page.tsx`
- Create: `apps/sentriq-console/src/components/marketing/`, `apps/sentriq-console/src/components/auth/`, `apps/sentriq-console/src/lib/demo-access.ts`, `apps/sentriq-console/src/lib/demo-access.test.ts`
- Create: `apps/sentriq-console/e2e/marketing.spec.ts`

**Interfaces:**
- Consumes: design tokens, app shell and shared validators from Tasks 1–2.
- Produces: marketing routes and a non-production local sample identity selector for Sentriq Developer (`developer@sentriq.test`).

- [ ] **Step 1: Write tests** for public-route headings/navigation, pricing's illustrative label, form validation, and production-disabled demo identity selection.
- [ ] **Step 2: Run tests and confirm expected failures** for missing routes and access guard.
- [ ] **Step 3: Implement editorial marketing pages** with working CTA/navigation links, mobile menu, labeled product preview, security/privacy explanation and no invented customer or performance claims.
- [ ] **Step 4: Implement local demo login** with visible development-only labeling; keep the demo selection out of production builds.
- [ ] **Step 5: Run marketing and demo-access tests, typecheck and console build.**
- [ ] **Step 6: Commit** as `feat(console): add Sentriq marketing and demo access`.

### Task 4: Sentriq console shell and operational workflows

**Files:**
- Create: `apps/sentriq-console/src/app/console/layout.tsx` and page files for `overview`, `applications`, `applications/[id]`, `api-keys`, `protected-actions`, `policies`, `sessions`, `events`, `integrations` and `settings`
- Create: `apps/sentriq-console/src/components/console/`, `apps/sentriq-console/src/lib/console-adapter.ts`, `apps/sentriq-console/src/lib/mock-console-adapter.ts`, `apps/sentriq-console/src/lib/mock-console-adapter.test.ts`, `apps/sentriq-console/src/lib/console-fixtures.ts`
- Create: `apps/sentriq-console/e2e/console-workflows.spec.ts`

**Interfaces:**
- Consumes: shared schemas and sample user `Sentriq Developer` from Tasks 1–3.
- Produces: replaceable `SentriqConsoleAdapter` with `listApplications`, `createApplication`, `getApplication`, `listApiKeys`, `createApiKey`, `revokeApiKey`, `listProtectedActions`, `saveProtectedAction`, `listPolicies`, `savePolicy`, `listEvents`, `listSessions`, `revokeSession` and `resetDemoState`; search/filter functions use typed data.

- [ ] **Step 1: Write adapter tests** for application creation/validation, create-once fake key display and revoke, action policy saves, event/session filters, selected-session revoke, persistence/reset and production demo guard.
- [ ] **Step 2: Run adapter tests and verify they fail** before the adapter exists.
- [ ] **Step 3: Implement the typed in-browser mock adapter** and fixture set; fake credentials use unmistakable non-secret values and are never reusable outside the UI.
- [ ] **Step 4: Implement responsive console navigation and all operational pages** with meaningful forms, validation, confirmations, filters, details, status feedback and sample-data labels.
- [ ] **Step 5: Write and run Playwright flows** creating an app, adding a protected action, filtering events and revoking one sample session while another stays active.
- [ ] **Step 6: Run adapter tests, console typecheck and console build; commit** as `feat(console): add developer console workflows`.

### Task 5: Evidence-grounded mock investigator and policy suggestions

**Files:**
- Create: `apps/sentriq-console/src/app/console/investigate/page.tsx`, `apps/sentriq-console/src/components/investigate/`, `apps/sentriq-console/src/lib/mock-investigator.ts`, `apps/sentriq-console/src/lib/mock-investigator.test.ts`, `apps/sentriq-console/e2e/investigation.spec.ts`
- Modify: console adapter and fixtures from Task 4 to expose investigation and draft-suggestion operations.

**Interfaces:**
- Consumes: typed security events, deterministic fixture decisions and the console adapter from Tasks 1 and 4.
- Produces: local answers with `recordedFacts`, `inferences`, `missingEvidence`, `nextSteps` and `citedEventIds`; draft suggestion state changes only after explicit confirmation.

- [ ] **Step 1: Write tests** proving citations refer to selected event IDs, missing records are reported rather than invented, the fixture's risk score/decision remain unchanged, and an unconfirmed suggestion remains draft.
- [ ] **Step 2: Run tests and confirm the investigator module is missing.**
- [ ] **Step 3: Implement deterministic mock answer templates** keyed by incident/question; derive facts only from the selected records, label inference, and provide event references.
- [ ] **Step 4: Implement the investigation workspace** with incident selector, evidence timeline, question buttons/chat, incident summary and separate fact/inference/missing/next-step sections.
- [ ] **Step 5: Add policy suggestion review and explicit confirm/cancel dialog**; only the confirmed local demo adapter may update sample policy state.
- [ ] **Step 6: Run investigator, adapter and browser workflow tests; commit** as `feat(console): add evidence-based mock investigations`.

### Task 6: Northstar mock accounts, workspace and sensitive-action journeys

**Files:**
- Create: route files under `apps/demo-web/src/app/` for `/`, `/login`, `/signup`, `/dashboard`, `/profile`, `/settings`, `/settings/security`, `/settings/sessions`, `/settings/export`, `/settings/delete-account`, `/security-verification` and `/security-activity`
- Create: `apps/demo-web/src/components/workspace/`, `apps/demo-web/src/components/settings/`, `apps/demo-web/src/lib/demo-access.ts`, `apps/demo-web/src/lib/demo-access.test.ts`, `apps/demo-web/src/lib/northstar-adapter.ts`, `apps/demo-web/src/lib/mock-northstar-adapter.ts`, `apps/demo-web/src/lib/mock-northstar-adapter.test.ts`, `apps/demo-web/src/lib/northstar-fixtures.ts`, `apps/demo-web/e2e/northstar-workflows.spec.ts`

**Interfaces:**
- Consumes: shared action/event contracts and Northstar visual tokens from Tasks 1–2.
- Produces: typed local adapter with `getCurrentUser`, `selectDemoUser`, `updateProfile`, `listSessions`, `revokeSession`, `createSampleExport`, `requestAccountDeletion`, `getSecurityActivity` and `simulateVerificationState`; Alice and Bob have separate fixture data and Alice has distinct session IDs.

- [ ] **Step 1: Write adapter/access tests** for Alice/Bob fixture separation, profile validation, synthetic export contents, confirmed-only sample account deletion, individual session revocation, simulated-not-verified passkey states and production-disabled demo identity selection.
- [ ] **Step 2: Run tests and verify expected missing adapter/export/state failures.**
- [ ] **Step 3: Implement local demo login and responsive workspace pages** with Alice and Bob sample identities, profile save feedback, security settings, activity and sessions.
- [ ] **Step 4: Implement export, delete and verification flows** with clear sample-only labels; never claim a simulated passkey succeeded as real verification.
- [ ] **Step 5: Write and run Playwright workflows** for Alice profile edit/export, confirmation paths, selective session revoke and switching to Bob's separate fixtures.
- [ ] **Step 6: Run adapter tests, demo typecheck and demo build; commit** as `feat(demo): add Northstar account workflows`.

### Task 7: Documentation, full acceptance checks and Stage A handoff

**Files:**
- Create: `README.md`, `docs/architecture.md`, `docs/security-model.md`, `docs/demo-script.md`, `docs/api.md`, `docs/frontend-review.md`, `docs/known-limitations.md`
- Create: `e2e/frontend-quality.spec.ts`, `scripts/capture_frontend.py`, screenshot evidence under ignored `.artifacts/frontend/`
- Modify: root and app scripts/config only as needed from verified failures.

**Interfaces:**
- Consumes: both apps, adapters, contracts and routes from Tasks 1–6.
- Produces: reproducible developer instructions and a factual Stage A readiness report.

- [ ] **Step 1: Write cross-app Playwright acceptance tests** for every required route, main navigation links, sample labels, core forms/dialogs, keyboard focus and no browser-console errors.
- [ ] **Step 2: Write viewport checks** at 375, 768, 1024 and 1440 CSS pixels plus landscape; assert `document.documentElement.scrollWidth <= window.innerWidth` and inspect mobile menus/dialogs.
- [ ] **Step 3: Run all unit/type tests and verify any acceptance failures before adjusting the UI.**
- [ ] **Step 4: Run focused browser suites, both app builds and full root verification** (`pnpm test`, `pnpm typecheck`, `pnpm build`, `pnpm test:e2e`); record exact outcomes.
- [ ] **Step 5: Run the webapp-testing helper with `--help`, then use its server wrapper and a Python Playwright script to capture desktop/mobile screenshots** for the Sentriq landing page, console overview, investigation workspace and Northstar dashboard/settings; inspect each image, fix visual defects and re-run affected checks.
- [ ] **Step 6: Complete Stage A docs**. Explicitly mark all mock security behavior and unavailable Stage B work; include actual commands/results, route inventory, screenshot paths and known defects.
- [ ] **Step 7: Run `git diff --check`, inspect all changed files and confirm no secret values or real `.env.local` are present. Commit** as `feat: complete Sentriq and Northstar frontend MVP`.
- [ ] **Step 8: Fetch the target remote and verify the push is a fast-forward. Push `main` without force; if remote state or authentication blocks this, preserve local commits and report the exact blocker.**

## Execution notes

- Execute inline in the current session, as the user said “Proceed now”; do not pause for another architecture approval.
- Do not run backend, database, OpenAI or WebAuthn server implementation tasks in this plan.
- After completion, provide **SENTRIQ FRONTEND — READY FOR REVIEW** with routes, screenshots, checks, known issues, commit SHA and push status, then stop for Stage B approval.
