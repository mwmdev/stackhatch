# StackHatch Launch Readiness Brief

## Product

StackHatch turns a blank canvas, product requirements, a public repository, or a personal template
into an editable system diagram, Note nodes, and handoff artifacts. It is for developers taking
over a codebase, returning to a complex project, or keeping a system architecture visible while
they build.

The product is free to use. There are no tiers, subscriptions, quotas, or feature gates. Users
provide their own Anthropic API key, choose a supported Claude model, and are billed directly by
Anthropic for their AI usage.

## Activation

The primary activation event is a user creating a real project from any of the four starting points
and reaching the architecture workspace.

The homepage and dashboard should give equal prominence to all four starting points:

- **Start fresh** creates an editable blank canvas without requiring an Anthropic key.
- **Upload requirements** turns a Markdown or text brief into an initial architecture map.
- **Map a repo** analyzes a public GitHub repository and records scan provenance.
- **Use a template** creates a new personal project from a saved architecture.

AI entry points explain that an Anthropic key is required and return users to the same starting
point after setup.

The north-star metric is weekly active architecture maps created from real project inputs. Supporting
launch signals are qualified visits, first-project activation, return usage, exports, and GitHub
stars.

## Core Launch Capabilities

- GitHub authentication and encrypted per-user Anthropic keys.
- Per-user Claude model and theme preferences.
- Per-user custom node subtypes and checked-in, immutable architecture prompts.
- Repository analysis, requirements input, chat, and a fully editable canvas.
- PNG, SVG, JSON, YAML, and PRD exports for every user.
- Unlimited personal projects, Note nodes on architecture maps, and personal templates.
- Self-service account deletion plus support, privacy, and terms surfaces.

## Risks and Validation

The main launch risks are repository-analysis quality, whether the BYOK setup is understandable,
and whether users return to update architecture decisions and export useful handoff artifacts. Watch
for missing keys, no first project, projects with no follow-up edit or export, and failed provider
requests.

Validate the product through public repository walkthroughs, developer onboarding stories, direct
outreach to maintainers, and community launches. Measure landing-page signup, key setup,
first-project activation, first export, alternative exploration, GitHub stars, and weekly return
usage.

## Technical Notes

The launch baseline includes Next.js, GitHub authentication, encrypted per-user settings, per-user
custom subtypes, checked-in prompt defaults, personal projects, Note nodes stored as part of each
architecture map, personal templates, tests, and migrations. Production does not use a
server-managed Anthropic key or model fallback, and the web product has no roles, administrator
surface, or impersonation mode.

Production migrations run offline during a maintenance window against an explicit database path.
The same explicit-path boundary protects the narrow host-authorized account preview/delete command;
it is not a replacement administrator product. Self-service deletion removes the user's active
SQLite records transactionally, while WAL files and backups follow the deployment's retention
policy. A later GitHub login provisions a fresh account rather than reviving deleted data or an old
session.
