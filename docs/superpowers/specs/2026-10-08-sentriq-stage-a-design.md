# Sentriq Stage A Frontend Design

**Status:** Historical frontend design record. Its approved two-app architecture and visual guidance remain in force; its Stage A-only scope and stop gate were superseded by the user's autonomous full-MVP directive on 2026-10-08. See [the complete MVP architecture](2026-10-08-sentriq-mvp-architecture.md).

## Goal

Deliver two complete, independently runnable frontend applications in the existing Sentriq GitHub repository: the Sentriq marketing site and developer console, plus the Northstar Workspace demo application. Stage A ends at a review checkpoint. No backend work or live AI calls begin until the user approves that checkpoint.

## Approved architecture

Use a pnpm workspace with two Next.js App Router applications and two TypeScript packages:

```text
apps/
  sentriq-console/   # Sentriq marketing site and developer console, port 3000
  demo-web/          # Northstar Workspace, port 3001
packages/
  shared/            # Shared types, action identifiers, Zod contracts
  sdk/               # Initial typed server integration contracts only
```

The applications share contracts, not their visual systems or runtime state. Each has its own layouts, styling tokens, navigation and local demo adapter. `packages/sdk` defines typed integration boundaries but makes no HTTP requests. There is no database, authentication server, policy enforcement service, passkey verification server or production security path in Stage A.

The user approved this architecture directly. This document records the choices needed to execute it; it does not reopen the architecture decision.

## Product boundaries and demo honesty

- Every mock account, record, event, metric, evaluation and AI-style response is visibly marked as development/demo sample data.
- Local demo identity selection is available only outside production builds. It is a UI preview, not authentication or authorization.
- Mock adapters provide typed local behavior and are replaceable by future server adapters. They never claim to protect a real action.
- Northstar export downloads contain synthetic sample data. Account deletion, passkey verification, session revocation and security decisions are visibly simulated and do not claim to change real server state.
- No secrets, passwords or realistic reusable API credentials are stored in source or rendered. `.env.local` is ignored; `.env.example` contains empty OpenAI values only.
- Stage A does not install or call the OpenAI SDK. Do not request an API key. `OPENAI_MODEL` remains blank until Stage B verifies an identifier available to the user's account. No alternative model may be selected without the user's approval.

## Frontend visual design

### Sentriq

Use a precise, dark operations-console identity: graphite surfaces, readable evidence tables, quiet blue-gray borders and restrained cyan signals. The memorable element is the evidence-to-decision timeline: recorded events lead to a deterministic policy result, followed by a clearly labeled sample explanation. Avoid neon glow, scanlines, fake live telemetry, unsupported trust statistics and decorative gradients.

| Token | Value | Use |
| --- | --- | --- |
| `sentriq.canvas` | `#0F171E` | Page background |
| `sentriq.surface` | `#16232C` | Navigation and panels |
| `sentriq.raised` | `#1D2C37` | Dialogs and selected rows |
| `sentriq.line` | `#2D3B46` | Dividers and borders |
| `sentriq.ink` | `#E6EEF1` | Primary text |
| `sentriq.muted` | `#A9BAC4` | Secondary text |
| `sentriq.signal` | `#63C7D8` | Primary accent and focus |
| `sentriq.success` | `#58BA91` | Success state |
| `sentriq.warning` | `#DDB56D` | Warning state |
| `sentriq.danger` | `#E57979` | Denied/revoked state |

Use Manrope or a locally bundled equivalent for UI text, with IBM Plex Mono for code and tabular identifiers. Keep long-form line lengths readable. The marketing home page uses a left-aligned editorial headline beside a product evidence preview; the console uses a compact sidebar, contextual page header, and content layouts that prioritize event evidence over decorative cards. Use Lucide SVG icons with text labels where possible.

### Northstar Workspace

Use a clearly separate light account-workspace identity: soft cool-gray canvas, white surfaces, ink-blue text and measured teal/blue accents. The product should feel like a calm account portal rather than a second security console. Use a familiar settings sidebar, direct page titles and readable forms. No dashboard card grid without meaningful hierarchy.

| Token | Value | Use |
| --- | --- | --- |
| `northstar.canvas` | `#F3F6F8` | Page background |
| `northstar.surface` | `#FFFFFF` | Forms and content panels |
| `northstar.ink` | `#142531` | Primary text |
| `northstar.muted` | `#526673` | Secondary text |
| `northstar.line` | `#DCE5EA` | Dividers and borders |
| `northstar.primary` | `#2D6488` | Primary actions and links |
| `northstar.secondary` | `#3D7B75` | Secondary security signal |
| `northstar.danger` | `#B83232` | Destructive action |

Use Plus Jakarta Sans with Source Sans 3 or locally bundled equivalents. Keep the settings experience restrained and functional. The dashboard has an account overview and recent activity; sensitive settings pages provide clear context, consequences and confirmation steps.

### Shared interaction standards

- Use semantic buttons, links, headings, forms, labels and tables; do not use clickable generic containers.
- Provide visible keyboard focus, inline validation, success/error feedback and a sensible empty state.
- Confirmation dialogs keep focus contained, close with Escape when safe, return focus to their trigger and name the action being confirmed.
- Support `prefers-reduced-motion`; avoid motion that communicates security state without text.
- Do not use color as the sole status signal. Verify normal text contrast at 4.5:1 or higher against its actual surface.
- Check widths 375, 768, 1024 and 1440 pixels plus a narrow landscape viewport. No horizontal page overflow.

## Routes and user-facing behavior

### `apps/sentriq-console`

Public routes: `/`, `/features`, `/developers`, `/security`, `/pricing`, `/login`, `/signup`.

The homepage uses the tagline “Trust doesn't end at login.” and explains sensitive-action protection without claiming guaranteed breach prevention. Marketing pages cover features, developer integration, security/privacy and illustrative or coming-soon pricing, with working CTAs, responsive navigation and a professional footer. The developer page shows a server-side integration example based on `packages/sdk` types and labels the code as a Stage A contract, not a live integration.

Console routes: `/console/overview`, `/console/applications`, `/console/applications/[id]`, `/console/api-keys`, `/console/protected-actions`, `/console/policies`, `/console/sessions`, `/console/events`, `/console/investigate`, `/console/integrations`, `/console/settings`.

The console provides a responsive navigation shell, local sample developer access as Sentriq Developer (`developer@sentriq.test`), application create/detail workflows, mock API-key create/copy-once/revoke states with scope and sample timestamps, protected-action configuration, deterministic policy editing, searchable/filterable events and sessions, session inspection/revoke simulation, integration guidance and settings. Session views show user, session ID, app, device/browser, approximate sample network context, timestamps, status and risk indicators; never show session tokens. Event views show timestamp, app, protected action, session, event type and decision evidence. Application/policy screens explain that the integrating developer must enforce decisions in their own backend; a browser UI alone does not protect an action. All controls give visible feedback.

The investigator offers incident selection, event timeline, suggested questions and mock answers that cite event IDs. Each response separates **Recorded facts**, **Inference**, **Missing evidence**, and **Next steps**. A fact must come from a selected stored mock record. Inferences are labeled and cannot claim a person was identified. An incident summary shows application, session, protected action, signals, deterministic policy decision, timeline and investigation steps. Risk explanations display the sample risk score as fixture data; the mock explanation cannot calculate or modify the score or policy decision.

AI-assisted policy suggestions appear as drafts. A developer can review scope and rationale and must explicitly confirm before a local demo policy state changes. The interface labels this as a sample workflow, never as a production policy.

Console page details:

- Overview shows registered applications, recent sample evaluations, allow/challenge/deny counts, active sample sessions, recent events and sample integration status.
- Applications supports create/list/detail, name, permitted origins and sample status. Detail shows protected actions, integration guidance, fake credential management, policy summary and recent evaluations.
- API keys supports name/scope, created/last-used sample timestamps, one-time display of an unmistakably fake value, copy feedback and revoke confirmation.
- Protected actions supports registration of the six shared action identifiers and allow, contextual-risk, fresh-authentication or deny policy choices, with validation and save feedback.
- Policies provides deterministic readable rules and a persistent notice that the integrating developer must enforce them server-side.
- Sessions supports user/app/status filters and user search, detail inspection and selected-session revoke simulation; no token is shown.
- Events supports search and filters over session-created, action-evaluated, verification-required/completed, denied, revoked and policy-changed fixtures, including evidence references.
- Integrations shows installation/environment examples and the initial typed SDK contract; any health indicator is labeled sample rather than live.
- Settings includes developer profile, organization, security preferences, account management and a working local sign-out/reset flow.

### `apps/demo-web`

Routes: `/`, `/login`, `/signup`, `/dashboard`, `/profile`, `/settings`, `/settings/security`, `/settings/sessions`, `/settings/export`, `/settings/delete-account`, `/security-verification`, `/security-activity`.

Local demo identity selection offers Alice Morgan (`alice@northstar.test`) and Bob Carter (`bob@northstar.test`) only in development. The app shows synthetic profile data and activity. A second Alice demo session has a distinct sample identifier and can be selectively marked revoked. A Bob view shows Bob's own fixture data. These client-side behaviors demonstrate the intended flow but do not establish cross-user security.

The home, login and signup routes provide the Northstar identity and sample-only entry flow. The dashboard includes account overview, recent activity, profile information and export/security/session shortcuts. Profile supports validated permitted-field edits and saved feedback. Settings links to security preferences, sessions, export and deletion. Security settings explains verification and active-session behavior. Sessions show browser/device, approximate sample network context, creation/last activity, current-session marker and revoke status. Security activity lists user-facing sample alerts and offers a simulated “Secure my account” flow.

Export explains the included categories (profile, preferences, activity and session summaries), builds a downloadable JSON or CSV from synthetic sample records after a confirmation step and shows progress, success and error UI states. Delete account explains consequences, requests fresh verification in the mock flow, requires an explicit confirmation flow and ends in a clearly simulated success/failure state. Security verification lets the reviewer navigate clearly labeled mock states (ready, processing, simulated outcome, expired, failed, retry and cancel); every outcome states that no passkey was verified and no real protected action was authorized. Security activity includes a clearly labeled simulated “Secure my account” flow.

## Shared contracts and adapters

`packages/shared` owns the action identifier constants `account.delete`, `data.export`, `admin.invite`, `email.change`, `password.change` and `session.revoke`; Zod input schemas; and shared `Application`, `ProtectedAction`, `Policy`, `PolicySuggestion`, `SecurityEvent`, `SessionSummary` and `EvaluationDecision` types. Validation rejects malformed names/origins/actions before a mock save.

`packages/sdk` exports type contracts only: configuration, protected-action evaluation input, typed `ALLOW | STEP_UP | DENY` result and a `SentriqClient` interface. It contains no network, retry, timeout, key handling or live integration implementation in Stage A.

Each frontend defines a replaceable adapter interface and a local implementation. The adapter API returns typed fixtures and performs local demo mutations; view components depend on the interface rather than fixture arrays. User-controlled demo changes remain in the browser and can be reset to fixtures.

## OpenAI boundary and future Stage B requirement

Stage A includes no OpenAI package or route. `.env.example` has empty `OPENAI_API_KEY=` and `OPENAI_MODEL=` entries plus `OPENAI_MAX_OUTPUT_TOKENS=1200`; it contains no key. `.gitignore` excludes `.env`, `.env.*` and `.env.local`, while allowing `.env.example`. Do not create `.env.local` during Stage A.

When Stage B is separately approved, request the key through the user's secure `.env.local` configuration, then use protected server-side environment variables in Railway or Render. Verify the model identifier available to that account before any authorized live inference. Use OpenAI's official SDK and Responses API only. If the preferred Luna 6 model cannot be verified, stop and ask before using an alternative. Ground investigator output in retrieved event records; preserve the fact/inference/missing-evidence split. Never send passwords, session/authentication tokens, API keys or other secrets to the model. AI cannot execute arbitrary SQL, invent evidence, reveal secrets, approve protected actions, undo session revocation or weaken authentication/authorization on errors. Stage B must add bounded output, timeouts, per-user/application rate limits, token/cost tracking when supported, deduplication, and mocked integration tests before any separately authorized live call.

## Verification and milestone gate

Stage A passes only when both apps run independently, all listed routes render, the key forms/dialogs/filters and mock flows work, empty/loading/error/success feedback exists for relevant flows, and sample/AI mock status is unmistakable. Run shared and adapter unit tests, both typechecks and builds, Playwright navigation/workflow checks, keyboard checks, and responsive overflow checks at the specified widths. Inspect representative screenshots at desktop and mobile sizes; record actual results and remaining issues in `docs/frontend-review.md`.

Create a `.env.example`, `.gitignore`, workspace README with exact run commands, and the Stage A versions of `docs/architecture.md`, `docs/security-model.md`, `docs/demo-script.md`, `docs/api.md`, `docs/frontend-review.md` and `docs/known-limitations.md`. Documentation must identify mock behavior and defer real enforcement/API behavior to Stage B. Commit Stage A with a descriptive message, then push to the specified GitHub `main` branch only if a fresh fetch confirms it remains empty or is a fast-forward. Never force-push. Report the commit SHA and push result. Stop after the frontend checkpoint and wait for explicit Stage B approval.
