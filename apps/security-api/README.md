# Sentriq security API

Fastify reference API used by the Northstar demo. It provides application-scoped auth, WebAuthn registration/login, secure sessions, Reclaim, deterministic action evaluation, WebAuthn step-up, and audit events. Northstar calls it through same-origin server routes; browser JavaScript never receives the application API key or raw API session token.

## Local development

From the repository root, run `pnpm --filter @sentriq/security-api seed:demo` to create synthetic Northstar data and private bootstrap credentials. Configure Northstar's ignored `apps/demo-web/.env.local` from `.env.example`, then use `pnpm dev` to start both apps. `pnpm --filter @sentriq/security-api db:migrate` applies versioned migrations to the configured data directory. Development startup initializes the local database; production startup verifies migration history and never migrates automatically.

Defaults: `127.0.0.1:4000`, persistent PGlite data at `.data/security-api`, and local Northstar origin `http://localhost:3001`. PGlite permits one active writer for its directory. It is not a PostgreSQL cluster or a multi-instance store.

## Configuration

- `NODE_ENV`: `development`, `test` or `production`.
- `SENTRIQ_HOST`: `127.0.0.1`, `0.0.0.0` or `::1` (default loopback).
- `SENTRIQ_PORT`: 1–65535 (default 4000).
- `SENTRIQ_DATA_DIR`: database directory; production requires an absolute path.
- `SENTRIQ_TLS_TERMINATED=true`: production operator assertion that an external TLS proxy is configured; this API does not create TLS itself.
- `SENTRIQ_RATE_LIMIT_MAX`, `SENTRIQ_RATE_LIMIT_WINDOW_MS`, `SENTRIQ_LOG_LEVEL`: bounded process-level rate and log settings.

Production requires explicit TLS termination and persistent absolute storage. The reverse proxy, network restrictions, backups, volume permissions, and secret rotation remain operator responsibilities. Forwarded IP headers are not trusted; current in-memory limits do not coordinate multiple instances.

## Verification

Run `pnpm --filter @sentriq/security-api typecheck` and root `pnpm test`. The auth and policy suites use PGlite and generated software WebAuthn assertions through the actual SimpleWebAuthn verifier. They are not physical authenticator or production PostgreSQL verification.

The service currently stores Northstar's demo users, passkeys and sessions; a storage adapter for a host-owned identity/session database is not complete. See [architecture](../../docs/architecture.md), [security model](../../docs/security-model.md), and [policy contract](POLICY-CONTRACT.md).
