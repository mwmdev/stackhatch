# StackHatch Launch Readiness Brief

## Product promise

StackHatch turns a blank canvas, requirements, a public repository, or a local template into an
editable architecture map and useful handoff artifacts. It is free, open source, accountless, and
local-first.

The launch promise is architectural, not contractual sleight of hand: StackHatch infrastructure has
no route for project content or provider credentials. The browser stores the workspace. GitHub and
Anthropic receive only the direct requests a user explicitly approves.

## Activation

Activation is a useful map created from any of the four starting points:

- **Start fresh** creates a local blank canvas with no provider request.
- **Upload requirements** previews the input and asks before contacting Anthropic.
- **Map a repo** asks before the browser contacts GitHub, shows evidence status, then asks separately
  before contacting Anthropic.
- **Use a template** copies a device-local template into a new local project.

Because there is no analytics pipeline, launch learning comes from opt-in qualitative research,
public issue discussions, reproducible bug reports, community contributions, and voluntary public
feedback—not behavioral tracking.

## Release boundary

- `npm run build` must produce `out/`, the generated host policy, and a passing static verifier.
- The supported production image contains Caddy plus static files only.
- Production accepts no database, OAuth, analytics, provider, or encryption secret.
- Production mounts no writable application volume and runs with a read-only filesystem.
- CSP `connect-src` allows only self, GitHub's API, and Anthropic's API.
- All live public surfaces describe browser ownership, direct providers, host request metadata,
  remembered-key risk, data-loss risk, community support, and the absence of migration.

## Launch risks

- Users may mistake browser-local persistence for cloud sync and lose work.
- Users may remember a provider key on a shared or compromised browser profile.
- Provider CORS, rate limits, billing, or API changes may break optional actions.
- Repository evidence and generated output may be incomplete or wrong.
- A static host or CDN may inject scripts, omit security headers, retain request logs, or serve stale
  policy and application bytes from different releases.

Mitigations include visible storage status, explicit backup and destructive controls, provider
disclosures, partial-evidence warnings, immutable candidate digests, direct-refresh tests, exact CSP
hash generation, a read-only production image, and a human-gated cutover runbook.

## Static release gate

Before production cutover:

1. Pass unit tests, typecheck, lint, changed-file formatting, static build, artifact verification,
   development browser tests, and production-equivalent static browser tests.
2. Record source, artifact, host-policy, and container digests without rebuilding the candidate.
3. Verify blank editing creates no network request; provider actions contact only their approved
   origin; credentials never enter backups or logs.
4. Confirm every static route refreshes directly and unknown routes return the hardened 404.
5. Complete the inventory, owners, witness, rollback, observation window, and evidence locations in
   `docs/operations/local-first-cutover.md`.

Static release readiness does not authorize destruction. Retiring the legacy database, backups,
volumes, secrets, OAuth capability, analytics, images, ingress, or retained logs requires a separate,
witnessed production authorization against revalidated exact targets.
