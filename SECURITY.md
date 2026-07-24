# Security Policy

## Report a vulnerability privately

Use [GitHub private vulnerability reporting](https://github.com/mwmdev/stackhatch/security/advisories/new).
Do not open a public issue for a suspected vulnerability and do not include live API keys, private
project content, browser-storage exports, or other secrets.

Include the affected route or component, reproduction steps, potential impact, and any suggested
mitigation. This is a community-maintained open-source project, so response times are best effort
and there is no support SLA.

## Supported version

Security fixes target the current `main` branch and the static release served at `stackhatch.io`.
Self-hosted forks are responsible for tracking upstream changes and for their own host, logs,
headers, TLS, and retention practices.

## Security boundary

The supported release is a static browser application:

- no accounts, sessions, application API, server database, analytics, or runtime application secret;
- maps and preferences remain in the user's browser profile;
- provider keys remain in session memory unless the user explicitly remembers one locally;
- backups exclude provider credentials;
- approved network connections are limited to the StackHatch origin, GitHub's API, and Anthropic's
  API; and
- imported files, repository evidence, and model output are treated as untrusted data.

The host can still observe ordinary web-request metadata. GitHub and Anthropic receive only the
direct requests a user approves and apply their own security and privacy terms.
