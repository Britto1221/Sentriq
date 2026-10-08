# Contributing

Thanks for helping improve Sentriq. Keep changes focused, preserve the security boundaries, and avoid overstating what has been verified.

## Development

1. Use Node.js 22.13+ and pnpm 12.10.1.
2. Run `pnpm install`.
3. For Northstar flows, create a development seed and store its values only in ignored `apps/demo-web/.env.local`.
4. Run relevant checks: `pnpm typecheck`, focused tests, `pnpm test`, and `pnpm build`.
5. Run `pnpm test:e2e` with the local security API configured for browser security flows.

## Change requirements

- Keep authentication and protected-action authorization server-side.
- Use maintained cryptographic/WebAuthn libraries; do not add custom cryptography.
- Add regression tests for failure and replay paths. Never weaken a test to make a change pass.
- Keep user passwords, recovery codes, tokens, API keys, and other secrets out of logs, tests snapshots, screenshots, docs, and commits.
- Treat AI, if added in the future, as non-authoritative guidance only. Do not send recovery secrets to a model.
- Preserve migration immutability. Add a new migration rather than editing an applied migration.
- Clearly label local demo data and distinguish software authenticator tests from real devices.
- Keep English/Tamil security copy aligned and disclose translation-review limits.

## Pull requests

Describe the user-visible and security behavior, tests actually run, external dependencies, and unverified properties. Include before/after screenshots when changing visible layouts. Do not claim full WCAG or production readiness based on automated tests alone.
