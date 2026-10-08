# @sentriq/browser

Public browser entrypoint for the maintained SimpleWebAuthn browser ceremony
helpers. It is intentionally separate from `@sentriq/core`; database and
server-only WebAuthn verification code must never enter a browser bundle.

```ts
import { startAuthentication, startRegistration } from "@sentriq/browser";

const registrationResponse = await startRegistration({ optionsJSON });
const assertionResponse = await startAuthentication({ optionsJSON });
```

The host application's trusted server must verify every response with
`@sentriq/core` or another server-side verifier. A successful browser prompt is
not proof of authentication.
