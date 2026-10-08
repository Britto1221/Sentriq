# Security policy

Sentriq is an experimental hackathon/reference implementation and is not certified for production identity deployments.

## Reporting a vulnerability

Do not file an issue containing an exploit, credential, personal information, recovery code, session token, or API key. Use GitHub's private vulnerability reporting for this repository if available. Otherwise contact the repository maintainers through a private channel before public disclosure. Provide affected commit/version, impact, and a minimal safe reproduction. Do not test against systems you do not own or have permission to assess.

## Secret handling

Keep `.env.local`, `.data/`, generated bootstrap files, production credentials and recovery codes outside version control. Rotate any value that may have been exposed. Never paste secrets into the recovery guide, a model prompt, logs, screenshots, tests or support messages.

## Scope and limitations

The current project has not undergone a third-party penetration test or formal security certification. Local PGlite is single-writer, the API currently stores Northstar demo identities/sessions, and host-owned identity adapters are incomplete. Report these limitations when evaluating deployments.
