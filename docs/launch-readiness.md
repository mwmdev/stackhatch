# StackHatch Launch Readiness Brief

## Product

StackHatch turns public repositories, product briefs, and early requirements into editable system
diagrams, tradeoff notes, and handoff artifacts. It is aimed at technical founders, freelance
developers, and small product teams that need to make architecture decisions visible before
implementation hardens.

The product is free to use. There are no tiers, subscriptions, quotas, or feature gates. Users
provide their own Anthropic API key, choose a supported Claude model, and are billed directly by
Anthropic for their AI usage.

## Activation

The primary activation event is a user creating a real project from a repository, PRD, or blank
canvas and reaching the architecture workspace.

The dashboard should make both paths clear:

- Users without an Anthropic key can create and edit blank canvases manually.
- AI entry points explain that a key is required and link directly to Settings.
- Users with a key can analyze repositories, upload requirements, chat, compare alternatives, and
  generate PRDs.

The north-star metric is weekly decision-ready architecture maps created from real project inputs.

## Core Launch Capabilities

- GitHub authentication and encrypted per-user Anthropic keys.
- Per-user Claude model and theme preferences.
- Repository analysis, requirements input, chat, and a fully editable canvas.
- PNG, SVG, JSON, YAML, and PRD exports for every user.
- Unlimited personal and team projects, comments, invites, and team templates.
- Support, privacy, terms, and administrator support tooling.

## Risks and Validation

The main launch risks are repository-analysis quality, whether the BYOK setup is understandable,
and whether users return to update and share architecture decisions. Watch for missing keys, no
first project, projects with no follow-up edit or export, and failed provider requests.

Validate the product through public repository teardown examples, direct outreach to technical
founders, and community launches. Measure landing-page signup, key setup, first-project activation,
first export, team creation, and weekly return usage.

## Technical Notes

The launch baseline includes Next.js, GitHub authentication, encrypted user settings, a fresh
Drizzle schema, team collaboration, comments, templates, admin support tools, tests, and migrations.
Production does not use a server-managed Anthropic key or model fallback.
