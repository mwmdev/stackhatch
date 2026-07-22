# Free, Tierless BYOK StackHatch

## Summary

StackHatch is free software for GitHub-authenticated users. It has no paid plans, subscriptions,
feature tiers, product quotas, or upgrade paths. Every user supplies their own Anthropic API key,
chooses a supported Claude model, and can use the complete personal architecture workflow.

The web product has no account roles, administrator page, or impersonation mode. Users manage their
own settings and account lifecycle. Rare account operations remain outside the product in a narrow,
host-authorized command that must target an explicit SQLite database path.

## Goals

- Make every product feature available to every authenticated user.
- Keep Anthropic costs under each user's control through encrypted per-user BYOK.
- Give users direct control of their model, theme, custom node subtypes, and account deletion.
- Keep architecture prompts immutable and reviewable as checked-in application source.
- Remove billing, roles, web administration, impersonation, and global mutable settings.

## Non-Goals

- Anonymous or browser-local accounts.
- AI providers other than Anthropic.
- Product-level usage quotas or monetization.
- A replacement administrator dashboard or an operator authentication system inside StackHatch.
- Synchronous erasure of SQLite WAL bytes or operator-managed backups during account deletion.

## Users and Workflows

- GitHub-authenticated users own their personal projects, API-key settings, model preference, theme,
  templates, and custom node subtypes.
- Users without an Anthropic key can create and edit blank canvases. AI-dependent actions show a
  guided Settings prompt instead of an upgrade prompt.
- Each AI request uses the invoking user's encrypted key and selected supported model.
- Users can permanently delete their own account from Settings after entering the exact confirmation
  phrase. A later GitHub login provisions a fresh account; an old session cannot revive or access
  the deleted account.
- A host-authorized operator can preview an exact account and delete a confirmed internal user ID
  from a specifically selected database without entering the web application.

## Requirements

### Accounts and data

- Accounts have no product role or administrator flag. Sessions carry only the identity needed to
  bind a signed-in user to the current persisted account.
- User settings store an encrypted Anthropic key, a supported Claude model, theme, and validated
  custom subtype catalog.
- API keys are write-only and are never returned to the browser, logs, analytics, or operator output.
- GitHub provisioning creates the user and their settings row atomically.
- Self-service deletion derives the target exclusively from the signed-in session and deletes the
  parent user through the shared transactional cascade.
- Successful deletion removes the profile, encrypted key, projects, messages, templates,
  preferences, and custom node subtypes from the active application database. Unrelated users remain
  unchanged, and repeating a completed deletion is safe.
- SQLite secure deletion is enabled. WAL files and backups follow the operator's documented storage
  lifecycle and are not synchronously vacuumed or rewritten by a web deletion request.

### BYOK and AI

- Chat, repository analysis, alternatives, and PRD generation resolve the invoking user's key and
  model.
- There is no server-managed `ANTHROPIC_API_KEY` or `ANTHROPIC_MODEL` fallback.
- Missing-key failures use `AI_NOT_CONFIGURED`, direct the user to `/settings`, and never use billing
  or upgrade language.
- Every supported model is available to every user. Provider authentication, availability, and
  rate-limit errors remain actionable.
- Architecture, alternatives, repository-analysis, and PRD prompts are checked-in constants. They
  cannot be changed through settings, an API route, or an account tool.
- User subtype labels may be included only as bounded, validated context; they never become prompt
  instructions.

### Product access and settings

- Personal projects, repository scans, chat messages, templates, and exports have no product quotas.
- PNG, SVG, JSON, YAML, and PRD exports are available to everyone.
- Alternatives, Note nodes, locking, connection types, node descriptions, custom subtypes, and
  templates are available to everyone.
- Settings contains the BYOK key, per-user Claude model, theme, custom node subtypes, and the
  self-service account deletion control.
- Retired custom subtype values remain visible on existing nodes with category-level fallback
  presentation until the user replaces them.
- Pricing, checkout, billing management, subscription success, plan design, capability catalogs,
  quota counters, administrator navigation, and upgrade prompts are absent.

### Operator boundary

- The operator tool requires an explicit, canonical database path and never falls back to
  `DATABASE_URL`.
- Preview performs exact lookup by internal user ID, GitHub ID, or email and returns redacted
  identity hints, the internal ID, a database fingerprint, and owned-record counts. It never returns
  secrets or project, repository, canvas, prompt, or message content.
- Deletion accepts only an internal user ID plus an exact confirmation containing the selected
  database fingerprint and ID. It revalidates the database and identity immediately before calling
  the same deletion primitive used by self-service deletion.
- Production migration and operator deletion run with the application stopped. The operator takes a
  verified SQLite-consistent backup, including WAL state, before applying a migration.

## Edge Cases and Risks

- A missing key blocks only AI-dependent work; manual editing and non-AI exports remain available.
- A selected model unavailable to the user's Anthropic account produces model-unavailable guidance.
- Invalid custom subtype updates fail atomically and do not change the last confirmed catalog.
- A stale pre-deletion token cannot access data or silently recreate its account. Only a new GitHub
  authorization flow can provision a fresh account.
- A missing database path, ambiguous operator lookup, changed database fingerprint, or mismatched
  confirmation performs no deletion.
- Backups can retain deleted bytes until their configured expiration; privacy and operating
  documentation must state this boundary plainly.

## Testing and Validation

- Verify migration preflight, per-user settings backfill, schema constraints, cascade indexes, and
  rollback behavior against disposable file-backed databases.
- Test encrypted key isolation, write-only responses, key clearing, model isolation, subtype
  validation, and retired-subtype rendering.
- Test immutable prompt consumers with empty and populated custom subtype catalogs.
- Test account deletion target binding, full ownership cascades, rollback, replay, stale sessions,
  AI persistence races, and fresh-account re-login.
- Test operator exact lookup, redaction, database fingerprinting, confirmation mismatch, locked
  databases, and shared deletion behavior without using production data.
- Run unit/API/component tests, typecheck, lint, production build, Playwright, and a live browser pass
  through the affected workflows.

## Rollout

- Stop every process that can access the production SQLite database.
- Take and verify a SQLite-consistent backup that includes the applicable WAL state.
- Run the offline migration command against the explicit absolute database path, then start the new
  application version and verify login, settings, and a representative project.
- Keep `STACKHATCH_DEV_AUTH=0` in public environments and remove obsolete administrator variables.

## Open Questions

None.
