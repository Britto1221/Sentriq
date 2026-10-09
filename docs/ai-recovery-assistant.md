# Sentriq Assistant

**Status: under implementation.** Northstar exposes Sentriq Assistant on registration, sign-in, recovery, Device Link, and security settings pages. It provides explanatory guidance only. The page and server remain responsible for authentication, recovery, and authorization.

## Modes

- **OpenAI mode:** the server uses the official OpenAI Node SDK and Responses API with the verified preferred model identifier `gpt-6-luna`. The server first checks that model through the account's Models API. If the key is missing, the configured model differs from the verified identifier, model access fails, or inference fails, the assistant returns localized deterministic guidance.
- **Offline mode:** a bounded English/Tamil intent guide handles common sign-in, passkey, recovery, and Device Link questions without an external model. Users can choose this mode in the chat panel when OpenAI is configured. The interface labels each response as OpenAI or offline guidance.

The model ID was verified against the configured development account's model catalog on 2026-10-09. This does not establish access for another account or for Railway. Every running server verifies its configured model before its first inference; denied or unavailable access falls back offline.

## Configuration

Northstar reads only server-side variables:

```ini
OPENAI_API_KEY=
OPENAI_MODEL=gpt-6-luna
OPENAI_MAX_OUTPUT_TOKENS=350
```

Keep the key in an ignored local environment file or protected deployment variables. Do not use a `NEXT_PUBLIC_` variable. The preferred identifier is required by the current adapter; an unapproved model is not substituted. Output tokens are capped at 500 even if the environment value is larger. The OpenAI SDK uses an 8-second timeout and zero automatic retries.

## Request and privacy boundaries

The browser sends only the selected language, current page category, and a bounded short chat transcript to Northstar's same-origin endpoint. The request omits browser cookies. It contains no user ID, account record, session state, authentication header, passkey material, or challenge. Northstar sends only the last three user messages, after removing email-like and phone-like text; previous assistant messages are not sent. The endpoint does not look up accounts or persist chat history.

The browser blocks messages that look like a recovery code, one-time code, password assignment, bearer token, or API credential before a request is sent. The server repeats this check and never forwards such a message to OpenAI. Do not enter credentials into chat. If a user bypasses the browser check and sends a secret directly to the Northstar endpoint, the endpoint returns a fixed localized warning without logging or forwarding that message.

When OpenAI mode is enabled, user text after minimization is processed by OpenAI to generate a response. The Responses request sets `store: false`; this prevents application conversation storage in the Responses API, but is not a claim about every provider-side retention or legal policy. Use offline mode when external processing is not wanted.

## Guardrails

- The provider has no tools and cannot call authentication routes.
- Instructions forbid asking for recovery codes and forbid account lookup, session creation, passkey approval, Shield approval, or recovery authorization.
- Recognized requests to bypass authentication are answered locally without calling the provider.
- Model output is length-limited, checked for secret solicitation, and rendered as plain React text, never as HTML or an executable action.
- A generated answer never indicates that a user is authenticated or that an operation succeeded.
- Per-requester-address requests are limited to 8 per minute, live calls to 20 per process per hour, and provider concurrency to 2. These are in-memory limits, so multi-instance deployments need shared rate-limit storage before public production use.
- Provider errors and timeouts are not logged or exposed; offline instructions keep login and recovery available.

The model is not an identity-verification or security authority. It can still produce incorrect explanations. The UI therefore offers links to actual Northstar sign-in, recovery, and passkey settings pages, and the trusted server independently enforces every security flow.

## Tests and limitations

Unit tests cover English/Tamil guidance, prompt-injection/bypass attempts, secret filtering, identifier minimization, output constraints, provider errors, model verification, timeout/retry configuration, and rate/cost limits. Browser tests separately verify chat accessibility, recovery guidance, local secret rejection, and plain-text rendering. Fixture tests do not establish live model behavior. A limited live-provider inference, deployment configuration, and external accessibility/native-language review are reported separately in the current implementation status.
