# Sentriq

Sentriq is a self-hostable TypeScript authentication security project. Its Northstar reference app demonstrates verified-email registration, passwordless WebAuthn passkeys, one-use recovery codes, server-enforced fresh verification for protected actions, QR-free device linking, and English/Tamil guidance.

**Maturity:** local reference implementation, not a hosted authentication service or production-certified product. The current `@sentriq/sdk` is a typed server-side client for the self-hosted Sentriq API; a framework-independent host-storage adapter is not complete. Read [the audit](docs/repository-audit.md) and [security model](docs/security-model.md) before adapting it for another application.

## Workspace

| Path | Purpose |
|---|---|
| `apps/security-api` | Self-hosted Fastify API using SimpleWebAuthn, local PGlite persistence, sessions, Reclaim, Device Link, Shield decisions, and audit events. |
| `apps/demo-web` | Northstar Next.js reference app and same-origin server-side API boundary. |
| `packages/shared` | Shared TypeScript/Zod contracts, action identifiers, and security-event shapes. |
| `packages/sdk` (`@sentriq/sdk`) | Typed server-side client for the self-hosted API. Keep its application key on the server. |
| `packages/access` (`@sentriq/access`) | English/Tamil message catalogs, accessibility preferences, and optional browser speech guidance. |
| `archive/legacy-sentriq-console` | Preserved historical Console source, outside active workspace builds. |

## Requirements

- Node.js 22.13 or later.
- pnpm 12.10.1.
- Chromium installed by Playwright for browser tests.

No paid email, AI, cloud, or voice service is required for local development. Localhost is accepted for WebAuthn development; deployable WebAuthn origins must use HTTPS.

## Local setup

```powershell
pnpm install
pnpm --filter @sentriq/security-api seed:demo
```

The seed writes a private Northstar application bootstrap file under `.data` and prints only its path. Open that file locally to configure the application ID and key in `apps/demo-web/.env.local`, using `.env.example` as the template. Do not paste its contents into chat, terminal commands, source, or Git. The file contains an application credential; it does not contain user passwords. `.env.local` and `.data` are ignored by Git.

Configure:

```ini
SENTRIQ_API_BASE_URL=http://127.0.0.1:4000
SENTRIQ_APPLICATION_ID=development-northstar
SENTRIQ_APPLICATION_KEY=<value-from-private-bootstrap-file>
NORTHSTAR_PUBLIC_ORIGIN=http://localhost:3001
```

Start the API and Northstar:

```powershell
pnpm dev
```

Open [http://localhost:3001](http://localhost:3001). New accounts enter an email, request a verification code, then use the clearly labeled development inbox control to retrieve the local code. That control is unavailable in production. A production deployment must inject an `EmailSender` and a real verified delivery channel; without one, registration fails closed with `EMAIL_UNAVAILABLE`.

The local API uses a persistent PGlite directory at `.data/security-api`. The service currently expects one API process to own that directory. Back it up before manual cleanup; do not point production at an ephemeral or shared multi-writer directory.

## Verification

```powershell
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

The Playwright virtual authenticator exercises actual browser ceremony wiring and server verification, but it is not physical-device validation. Automated axe checks and keyboard tests are not a complete WCAG audit. No real phone/security-key matrix, native screen-reader pass, external penetration test, or production email delivery is claimed.

## SDK use

Use `@sentriq/sdk` only from trusted server routes. Keep the application key server-side, derive user/session/resource identity from a trusted host boundary, and execute a sensitive operation only after the server's final `ALLOW`. The current package calls the self-hosted Sentriq API; it does not yet provide a storage-agnostic core that writes directly into a host application's own identity database. See [SDK integration](docs/sdk-integration.md).

## Documentation

- [Repository audit](docs/repository-audit.md)
- [Architecture](docs/architecture.md)
- [Security model](docs/security-model.md)
- [Passkey authentication](docs/passkey-authentication.md)
- [Action Shield](docs/action-shield.md)
- [Account recovery](docs/account-recovery.md)
- [Device Link](docs/device-link.md)
- [Accessibility](docs/accessibility.md)
- [Recovery assistant](docs/ai-recovery-assistant.md)
- [SDK integration](docs/sdk-integration.md)
- [Hackathon demo](docs/hackathon-demo.md)
- [Viva questions](docs/viva-questions.md)

## Open-source notes and limitations

The repository includes Apache-2.0 licensing and third-party notices. Workspace packages are not published to npm. Review dependency licenses when creating a release artifact. No production deployment, formal cryptographic review, native-speaker translation review, or real-device authenticator matrix is claimed.

See [SECURITY.md](SECURITY.md) for vulnerability reporting and [CONTRIBUTING.md](CONTRIBUTING.md) for development conventions.
