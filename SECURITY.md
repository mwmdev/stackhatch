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
- provider keys and the optional GitHub token remain in session memory unless the user explicitly
  remembers one locally, and the GitHub token is sent only to GitHub's API;
- backups exclude provider credentials and the GitHub token;
- approved network connections are limited to the StackHatch origin, GitHub's API, and the APIs of
  Anthropic, OpenAI, Google Gemini, and OpenRouter; and
- imported files, repository evidence, and model output are treated as untrusted data.

The host can still observe ordinary web-request metadata. GitHub and the AI provider a user selects
receive only the direct requests the user starts and apply their own security and privacy terms.
OpenRouter forwards each request to the provider of the chosen model.

## Static hosting controls

The generated `_headers` and Caddy policies restrict scripts to the same origin and hashes of
exported inline scripts; default, object, frame, form, base, and script-attribute sources are
disabled. Connections are limited to this origin, GitHub's API, and the Anthropic, OpenAI, Google Gemini, and OpenRouter API origins.
Response headers include `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, and
`Strict-Transport-Security: max-age=63072000; includeSubDomains`. The local Caddy container serves
plain HTTP; production TLS must terminate at the edge, which must preserve these headers (including
on errors). Browsers ignore HSTS delivered over HTTP. Do not add `preload` without an explicit
operator decision covering every subdomain and the long-lived preload commitment.

The generated CSP retains `style-src 'self' 'unsafe-inline'`: the exported Next.js 404 documents
contain an inline `<style>` element, so changing to `style-src 'self'` with only
`style-src-attr 'unsafe-inline'` would break that route. React/React Flow also use inline style
attributes, and image export uses `html-to-image`. Trusted Types enforcement is not enabled:
React 19/Next.js compatibility and the existing HTML rendering/export paths need validation
before restricting DOM sinks; untrusted HTML instead passes through the application sanitizer.
Neither decision is a substitute for reviewing sanitizer changes.

`node scripts/verify-static-output.mjs` independently checks the security-critical CSP directives,
headers in both host policies, secret-value patterns in exported text, non-root runtime user, and
read-only/capability-dropped/no-new-privileges Compose settings. It verifies local artifacts, not
deployed behavior; inspect live responses before claiming production security posture.
