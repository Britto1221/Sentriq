# Repository audit and refactor record

Audit date: 2026-10-08
Repository: `C:\Sentiq` / `Britto1221/Sentriq`
Baseline commit: `61ce3ada427b49fbe9364fe80878f867cd4bfd78`
Scope: final focused SDK vertical slice — Authenticate, Protect, Recover, Access, and a deterministic recovery guide.

This records the repository state before the current refactor work, then the intended disposition. It is a source and test-suite audit; it is not production certification. Uncommitted work was present and has been preserved. No `.env.local`, API key, persistent database content, or bootstrap secret was inspected for this audit.

## Repository facts

| Area | Observed baseline |
|---|---|
| Package manager | pnpm workspace, pnpm 12.10.1; Node engine is `>=22.13.0`. |
| Applications | `apps/security-api` is Fastify; `apps/demo-web` is Next.js 16 / React 19. |
| Shared packages | `packages/shared` contains TypeScript/Zod contracts and action identifiers; `packages/sdk` contains a server-only typed HTTP client; `packages/access` contains React localization, browser speech, and accessibility preferences. |
| Storage | Fastify API uses PGlite and Drizzle, versioned SQL migrations, and one-writer local persistence. It is not PostgreSQL and is not configured for multi-process writers. |
| Authentication | API source uses Argon2id passwords, opaque digest-backed sessions and SimpleWebAuthn server verification. Existing automated authenticator tests exercise the verifier with generated software assertions. |
| Security decisions | Persisted per-action `ALLOW` / `STEP_UP` / `DENY` policy records, WebAuthn step-up challenges, bound grants, protected Northstar server routes and audit records exist in the source. They require current-worktree tests below; source presence alone is not proof. |
| Recovery | Baseline included recovery-code storage and an older recovery flow. The current restricted Reclaim flow is recorded below. |
| Frontends | Northstar was a functional Next application but included preview/mock surfaces. Console source was not wired to a real console API and is preserved under `archive/legacy-sentriq-console`, outside active pnpm workspaces. |
| Existing tests | Vitest unit/integration tests, Playwright browser specs, axe checks, workspace typechecks and builds are configured. Hardware authenticator and assistive-technology manual testing were not evidenced. |
| Secrets | `.env*`, `.data/`, `.next/`, and test artifacts are ignored. Demo seed code writes randomly generated credentials and the application key only to a newly created, permission-restricted local JSON file. |
| Git state | Worktree was already modified at audit time; changes were preserved. Remote authentication was previously denied (HTTP 403), so this audit makes no claim that current work can be pushed. |

## Baseline capability matrix

| Capability | Baseline status | Evidence / limitation |
|---|---|---|
| WebAuthn registration and authentication | IMPLEMENTED_UNVERIFIED | SimpleWebAuthn server library, challenge/credential storage and verifier tests existed. No real platform authenticator was proven by the audit. |
| Secure application sessions | IMPLEMENTED_UNVERIFIED | Opaque session tokens, digest storage, cookies, expiry and revocation existed in the API. Host-owned session adapter was absent. |
| Action Shield | PARTIALLY_IMPLEMENTED | Policy and step-up code existed; Northstar direct protected-action enforcement and replay behavior needed integration verification. |
| Reclaim restricted recovery | MISSING / PARTIAL | Recovery codes existed, but the audited flow did not complete restricted replacement-passkey enrollment with the required lifecycle. |
| English and Tamil Access | IMPLEMENTED_UNVERIFIED | `packages/access` had i18next catalogs, preference controls, Web Speech API guidance and tests. Manual keyboard and screen-reader evidence was absent. |
| Recovery assistant | MISSING | No active AI provider or deterministic recovery guide was found at baseline. |
| Northstar real integration | PARTIALLY_IMPLEMENTED | Routes and BFF existed, but mock adapters and protected-flow gaps were identified in the earlier audit. |
| SDK | PARTIALLY_IMPLEMENTED | Server-only client supported policy, step-up and some event/recovery calls; it was not a storage-agnostic auth core or published framework package. |
| Console and AI threat dashboard | IMPLEMENTED_UNVERIFIED / OUT OF SCOPE | Presentation code used local/mock adapters and had no verified API boundary. Preserved as archived history, not active product surface. |
| Open-source release files | MISSING | Root README/license/contribution/security documents were not present in baseline `HEAD`. |

## Keep / modify / remove / defer decisions

| Component | Decision | Reason |
|---|---|---|
| Fastify/SimpleWebAuthn auth service and migrations | KEEP / MODIFY | Retain maintained WebAuthn verification and the working storage paths; extend Reclaim and strict policy behavior without rewriting migration history. |
| `packages/shared` | KEEP / MODIFY | Keep validated types, action IDs, and safe events; constrain recovery-code contract to six newly generated codes and remove unsupported risk/AI contract surface. |
| `packages/sdk` (`@sentriq/sdk`) | KEEP / MODIFY | Keep typed server-only HTTP boundary, request validation, timeouts and no-retry behavior; add/use policy, step-up, Reclaim and event contracts. This remains a remote API client, not a pure storage adapter. |
| `packages/access` | KEEP / MODIFY | Keep reusable React and localization work; active selection is English and Tamil. Voice guidance stays off by default and uses fixed text only. |
| Northstar (`apps/demo-web`) | KEEP / MODIFY | Keep as the real reference application and exercise its actual server/API integration; remove local mock success/authentication paths. |
| Sentriq Console source | DEFER / ARCHIVE | Outside the focused SDK product and not verified against a real console API. Source is retained under `archive/legacy-sentriq-console`; it is not built in the active workspace. |
| Threat scoring, behavioral/device fingerprinting, geolocation/network intelligence, AI policy advice, billing, enterprise analytics | REMOVE FROM ACTIVE SCOPE | These are unnecessary to this vertical slice, were not authoritative enforcement, and create privacy/accuracy or maintenance costs. Historical console files are preserved. |
| Deterministic policy and action-bound WebAuthn step-up | KEEP | Required for server-side protected operation enforcement. Decisions remain deterministic; a Reclaim code cannot satisfy Shield. |
| Reclaim recovery code verification and restricted enrollment | MODIFY / KEEP | A recovery code proves only the limited ability to replace a credential. It does not create a normal session or approve a sensitive action. |
| Optional model-backed recovery guide | DEFER | The local deterministic guide is fully usable without an API key. It is explicitly labeled as non-AI; no inference provider or credential is configured. |
| Production deployment, cloud control plane, npm publication | DEFER | Local verification and documentation are in scope. No deployment or package publication is authorized by this audit. |

## Verified implementation changes and remaining architectural gap

The refactor removes `apps/sentriq-console` from active workspace membership and preserves its source in the archive. It removes preview-only security outcomes from Northstar, adds owner-scoped persisted security event reads, constrains policy decisions to the three explicit modes, adds Reclaim's limited replacement enrollment path, and keeps Action Shield passkey-only. Newly generated recovery-code sets contain six entries. The Northstar assistant is deterministic and does not call any model or API.

The current security API remains the Northstar demo's user, passkey, session, recovery and policy store. Host websites own their business resources and must enforce policy decisions on their trusted server, but a storage-agnostic `@sentriq/core` adapter that lets a host retain its own user/session database is not complete. The published-product framing must not imply that integration capability is already present.

## Final passwordless authentication worktree status

The baseline table above describes the repository before the passwordless refactor; it is not a statement about the current worktree. In the current implementation, password signup/login was removed from active API routes and UI. Migration `0008_passwordless_email_registration.sql` renames the legacy credential table to `retired_password_credentials` so existing hashes are preserved but have no active model or route. New registration requires email verification before passkey enrollment. Northstar exposes a development-only local email inbox; no production email transport is wired, and production registration fails closed without an injected sender.

The current worktree also adds browser-bound Device Link requests with authenticated inbox approval and fresh passkey verification, request-scoped enrollment, six one-use recovery codes, and an HttpOnly BFF cookie for Reclaim transaction state. Current evidence is tracked in `docs/implementation-progress.md` and the test results reported at the end of the implementation task. The worktree still does not provide the storage-agnostic `@sentriq/core` adapter noted above, and neither real-device WebAuthn nor production email delivery has been verified.

## Verification limits

Test authenticators create software assertions that are sent through the maintained SimpleWebAuthn verification path; they are not physical-device proof. The browser E2E suite can use Playwright's virtual authenticator, which is not equivalent to validation on Apple, Android, Windows Hello or roaming hardware. No manual NVDA, VoiceOver or TalkBack test is recorded. Tamil copy is a deterministic draft and still needs review by a fluent speaker. PGlite verifies local behavior but does not establish a production PostgreSQL deployment. The existing single-process limits and unverified host-owned identity adapter remain release caveats.
