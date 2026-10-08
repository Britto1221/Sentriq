# Security API

This service owns identity and authorization persistence. Follow the approved MVP architecture in `../../docs/superpowers/specs/2026-10-08-sentriq-mvp-architecture.md`.

- Use real PGlite for persistence tests. One process owns each persistent data directory.
- Derive tenant/application scope from authenticated API keys; scope every user query by that context.
- Preserve composite ownership foreign keys. SQL migrations are immutable after application and must stay aligned with the Drizzle schema.
- Never log raw URLs, headers, bodies, passwords, cookie/API tokens, recovery codes, WebAuthn challenges or key material. Errors sent to clients and startup output must be generic.
- Never read existing secret values for tests. Generate ephemeral test tokens at runtime. Do not create a real `.env`, static passwords, or production seed data.
- Production requires a persistent absolute data directory and explicit TLS termination by the deployment proxy. Do not automatically migrate production at startup.
