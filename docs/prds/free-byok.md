# Free, Tierless BYOK StackHatch

## Summary

StackHatch is a free product for GitHub-authenticated users. It has no paid plans,
subscriptions, feature tiers, product quotas, or upgrade paths. Every user supplies
their own Anthropic API key, chooses a supported Claude model, and can use the full
product, including collaboration and export features.

## Goals

- Make every product feature available to every authenticated user.
- Keep Anthropic costs under each user's control through encrypted per-user BYOK.
- Replace billing-tier roles with the permission-only roles `user` and `admin`.
- Make team collaboration a first-class free workflow.
- Remove Stripe, billing, pricing, quotas, and upgrade-oriented product language.

## Non-Goals

- Anonymous or browser-local accounts.
- AI providers other than Anthropic.
- Product-level usage quotas or monetization.
- Migrating production data or active subscriptions; the application is prelaunch.
- Infrastructure rate limiting and abuse prevention beyond existing validation.

## Users and Workflows

- GitHub-authenticated users own personal projects, API-key settings, and model
  preferences.
- Users without an Anthropic key can create and edit blank canvases. AI-dependent
  actions show a guided Settings prompt instead of an upgrade prompt.
- Users can create teams directly, invite any number of members, create team
  projects, comment, and use team templates.
- Each collaborator uses their own Anthropic key when invoking AI on a shared
  project.
- Administrators retain user management, impersonation, shared prompt, and shared
  node-subtype controls. Administration does not unlock product features.

## Requirements

### Accounts and data

- `UserRole` is exactly `user | admin`; new accounts default to `user`.
- `ADMIN_GITHUB_ID` promotes the matching GitHub account to `admin`.
- User settings store an encrypted Anthropic key and a supported Claude model.
- API keys are write-only and are never returned to the browser.
- The prelaunch Drizzle history is replaced with one clean baseline. Existing local
  SQLite databases and Docker data volumes must be recreated.
- Subscription and usage tables are removed. Teams contain no plan, seat-limit, or
  Stripe fields.

### BYOK and AI

- Chat, repository analysis, alternatives, and PRD generation resolve the invoking
  user's key and model.
- There is no server-managed `ANTHROPIC_API_KEY` or `ANTHROPIC_MODEL` fallback.
- Missing-key failures use `AI_NOT_CONFIGURED`, direct the user to `/settings`, and
  never use billing or upgrade language.
- Every supported model is available to every user. Provider authentication,
  availability, and rate-limit errors remain actionable.

### Product access

- Projects, repository scans, chat messages, teams, members, and invites have no
  product quotas.
- PNG, SVG, JSON, YAML, and PRD exports are available to everyone.
- Alternatives, note nodes, locking, connection types, node descriptions, custom
  subtypes, comments, templates, and collaboration are available to everyone.
- Authorization still protects accounts, admin operations, project ownership, team
  membership, and team-owner actions.

### Teams

- `POST /api/teams` accepts `{ "name": string }`, creates the team and owner
  membership atomically, and returns the created team with HTTP 201.
- The dashboard lists memberships and provides direct team creation.
- Project creation offers Personal and Team workspaces, with optional team
  preselection from the team page.
- Projects created from a team template inherit that team after membership
  validation.

### Product surfaces

- Pricing, checkout, billing management, subscription success, plan design,
  capability catalogs, quota counters, and upgrade prompts are removed.
- Landing, support, settings, privacy/terms, and operational documentation describe
  free access and clarify that Anthropic bills the user's API usage.
- Settings contains BYOK key, per-user Claude model, and theme controls.
- The dashboard prominently guides users without a key while leaving manual canvas
  work accessible.

## Implementation Approach

- Remove Stripe routes, webhooks, libraries, components, dependency, and environment
  variables rather than leaving dormant billing code.
- Remove plan and usage abstractions; call sites render or execute full behavior
  directly.
- Keep the existing encrypted secret storage and extend `user_settings` with a model
  column. Clearing a key preserves the model preference.
- Keep shared prompts and custom subtype definitions in application settings, but
  move model selection out of global admin settings.
- Replace tier-dependent API response fields with stable authentication,
  authorization, validation, and BYOK errors.

## Edge Cases and Risks

- A missing key blocks only AI-dependent work; manual editing and non-AI exports
  remain available.
- A team member without a key cannot consume another member's key.
- A selected model unavailable to the user's Anthropic account produces the existing
  model-unavailable guidance.
- Team/project mutations continue to verify membership or ownership despite all
  features being free.
- Old local databases are intentionally unsupported after the baseline reset.

## Testing and Validation

- Verify the clean migration creates the tierless schema and boots on an empty DB.
- Test user/admin authorization, GitHub provisioning, dev auth, and impersonation.
- Test encrypted key isolation, write-only responses, key clearing, and per-user
  model isolation.
- Test unlimited project, scan, team, invite, and member flows.
- Test direct team creation and team project/template ownership.
- Test every formerly gated editor and export feature for a normal user.
- Test the missing-key dashboard/editor experience and AI error contract.
- Run unit/API/component tests, typecheck, lint, production build, Playwright, and a
  live browser pass through the affected workflows.

## Rollout

- Delete and recreate local SQLite databases and Docker data volumes.
- Remove Stripe and server-managed Anthropic secrets from deployment configuration.
- Deploy the clean schema and application together; no subscriber or data migration
  workflow is required.

## Open Questions

None.
