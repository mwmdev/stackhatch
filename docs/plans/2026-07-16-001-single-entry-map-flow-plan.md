---
title: Single-Entry Map Flow - Plan
type: feat
date: 2026-07-16
deepened: 2026-07-16
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
execution: code
---

# Single-Entry Map Flow - Plan

## Goal Capsule

- **Objective:** Make StackHatch feel like one editor-first application by having `/app` resume the authenticated user's last-opened map and placing every new-map method inside an editor-style creation workspace.
- **Authority:** Explicit user decisions in the Product Contract override planning assumptions; the Product Contract overrides technical convenience; repository conventions and `AGENTS.md` govern execution and landing.
- **Execution profile:** Standard-depth code change with persistent state, authenticated routing, multi-surface UI changes, compatibility redirects, and browser coverage.
- **Stop conditions:** Stop implementation if account-scoped resume cannot be added without weakening project ownership checks, or if preserving an existing start URL would require unsafe redirect behavior. Details left open by this plan may be resolved with repository-consistent judgment.
- **Tail ownership:** The implementing workflow owns migration generation, tests, dead-code cleanup, issue status, commit, rebase, `bd sync`, push, and verification that the branch is up to date with its remote.

---

## Product Contract

### Summary

StackHatch will expose one primary application entry instead of asking users to choose among four starts before they reach the editor.
Authenticated users who visit `/app` will resume their last-opened map, while users without a map will enter an editor-style empty state containing the four creation methods.
The map library remains available as a secondary All Maps view, and the public landing page promotes one Start a map action.

### Problem Frame

The public launchpad, authenticated dashboard, and new-project page currently divide the product into four parallel entry paths before users establish the editor as their working context.
The same creation logic is duplicated across surfaces, `/app` behaves as a dashboard instead of a work-resumption entry, and templates are useful only after a user has saved a personal template.
The desired simplification is conceptual: users enter StackHatch, return to their work, and choose a source only when they need a new map.

### Actors

- A1. A returning authenticated user who wants to continue working on a map.
- A2. A first-time or map-less authenticated user who needs to create a map.
- A3. An authenticated user who is already editing a map and wants to create another without replacing the current map.
- A4. A public visitor who chooses to start using StackHatch and must authenticate first.

### Requirements

**Application entry and resume**

- R1. `/app` resumes the map most recently opened by the authenticated account, with the state shared across that account's devices and browser sessions.
- R2. If the remembered map is missing or inaccessible, `/app` opens the newest available owned map; if no map exists, it opens the new-map chooser.
- R3. After a successfully loaded editor becomes active, it records resume state through an authenticated ownership-qualified mutation without changing the map's content-oriented `updatedAt` value or exposing one user's state to another user.
- R4. First-time and map-less users see the four creation methods as an empty state inside an editor-style workspace, not as a dashboard launchpad, modal, or side panel.

**Map creation**

- R5. The creation workspace supports blank map, requirements upload, public repository mapping, and template starts from one canonical route.
- R6. Starting a new map creates a separate project and leaves the current map intact; cancellation returns to the originating map when a safe origin is available.
- R7. Blank and template starts work without an Anthropic key, while requirements and repository starts preserve the current BYOK setup, continuation, validation, retry, and error behavior.
- R8. The template path offers a small curated set of read-only built-in starter maps alongside personal templates, and every selection creates an independent personal project copy.

**Navigation and compatibility**

- R9. The public landing page exposes one Start a map CTA that authenticates if needed and then enters the unified `/app` flow; it no longer presents four public start actions or a repository form.
- R10. The existing project library remains available as All Maps on a secondary authenticated route without the four start cards.
- R11. Existing safe start URLs continue into the canonical creation workspace with their valid method and repository context preserved, while unsupported or unsafe values fall back to the chooser.
- R12. Editor, settings, admin, and project-library navigation distinguish Resume/Open editor, New map, and All Maps without making `/app` behave like the old dashboard.

**Experience and measurement**

- R13. The chooser and source-specific states preserve keyboard access, visible focus, reduced-motion behavior, responsive layouts, status announcements, and recoverable loading/error states.
- R14. Existing privacy-safe analytics continue to identify the selected start method and first map view so pre-change and post-change time-to-first-map and return-to-work funnels can be compared without recording project IDs, repository values, or requirements content.

### Key Flows

- F1. Resume existing work
  - **Trigger:** A1 visits `/app` after authentication.
  - **Steps:** Resolve the account's remembered project; verify ownership; open it; record the successful open.
  - **Outcome:** The user reaches the editor without passing through a chooser or map library.
  - **Covered by:** R1, R2, R3, R12, R14.
- F2. Enter without any maps
  - **Trigger:** A2 visits `/app` and owns no projects.
  - **Steps:** Resolve no resume target; enter `/project/new`; show the editor-style chooser.
  - **Outcome:** The user chooses a source in the same visual and navigational context as map editing.
  - **Covered by:** R2, R4, R5, R13.
- F3. Create from the editor
  - **Trigger:** A3 chooses New map while editing a project.
  - **Steps:** Open the creation workspace with a safe return destination; select a source; complete any BYOK prerequisite; create a separate project; navigate to its editor.
  - **Outcome:** The original project remains stored and the new project becomes the last-opened map after its first successful load.
  - **Covered by:** R5, R6, R7, R8, R12.
- F4. Start from the public site
  - **Trigger:** A4 selects Start a map.
  - **Steps:** Authenticate with `/app` as the continuation; resume an existing map or show the chooser according to account state.
  - **Outcome:** The public site has one promise and the authenticated application determines the correct next state.
  - **Covered by:** R1, R2, R9, R14.
- F5. Browse all maps
  - **Trigger:** A1 or A3 chooses All Maps.
  - **Steps:** Load the owned-project list in its existing content-update order; open or delete a project; use New map when creation is desired.
  - **Outcome:** Map management remains available without competing with `/app` as the primary entry.
  - **Covered by:** R2, R6, R10, R12.

### Acceptance Examples

- AE1. Returning account resume
  - **Given:** An account owns maps A and B, B was updated most recently, and A was opened most recently.
  - **When:** The account visits `/app` on another device.
  - **Then:** StackHatch opens A and does not change A's `updatedAt` value.
  - **Covers:** R1, R3.
- AE2. Missing remembered map fallback
  - **Given:** The remembered project was deleted and the account still owns maps A and B, with B newest by `updatedAt`.
  - **When:** The account visits `/app`.
  - **Then:** StackHatch opens B, records B after its successful load, and never exposes another account's project.
  - **Covers:** R2, R3.
- AE3. First map
  - **Given:** An authenticated account owns no projects.
  - **When:** The account visits `/app` and chooses Blank map.
  - **Then:** Exactly one project is created and its editor opens without requiring an Anthropic key.
  - **Covers:** R2, R4, R5, R7.
- AE4. New-map cancellation
  - **Given:** A user is editing map A.
  - **When:** The user opens New map and then cancels before creation.
  - **Then:** The user returns to map A and no project is created or modified.
  - **Covers:** R6, R12.
- AE5. BYOK continuation
  - **Given:** A user without an Anthropic key selects requirements or repository start.
  - **When:** The user completes key setup.
  - **Then:** The user returns to the same canonical start mode with valid repository context preserved and can continue without reselecting the method.
  - **Covers:** R7, R11.
- AE6. Curated template resilience
  - **Given:** A user has no personal templates, or the personal-template request fails.
  - **When:** The user opens the template start.
  - **Then:** Curated built-ins remain selectable; choosing one creates a personal project copy and never creates a mutable built-in template record.
  - **Covers:** R8, R13.
- AE7. Legacy route safety
  - **Given:** A user follows a valid legacy blank, repository, requirements, template, or `#start` URL.
  - **When:** The route resolves.
  - **Then:** StackHatch reaches the matching canonical creation state without duplicate project creation; invalid modes, external `returnTo` values, and malformed repositories fall back safely.
  - **Covers:** R11, R13.

### Success Criteria

- The median elapsed time between start intent or authentication completion and `first_map_viewed` can be compared before and after release by start method, with the expected direction being lower for first-map creation.
- The median navigation time from `/app` to a returning user's map view can be measured separately from first-map creation, with the expected direction being lower than the current dashboard-mediated path.
- Existing project-creation, ownership, BYOK, and privacy-safe analytics guarantees remain green in automated coverage.

### Scope Boundaries

**Included**

- One canonical editor-style creation workspace and four source states.
- Account-scoped resume persistence and deterministic fallback.
- A secondary All Maps library.
- A small generic built-in starter catalog stored in code and copied into ordinary projects.
- Compatibility handling for current start methods, repository continuation, and safe internal returns.

**Deferred or excluded**

- A template marketplace, template publishing, built-in template editing, or database-seeded built-ins.
- Private repository support, new AI providers, changes to Anthropic key storage, or changes to repository-analysis behavior.
- Draft persistence for partially completed requirements uploads or repository forms.
- A broad refactor of the existing project editor, project API, or template-management model beyond the seams needed for this flow.
- A new analytics backend or collection of project IDs, repository names, uploaded content, or other source data.

---

## Planning Contract

### Key Technical Decisions

- KTD1. **Make `/app` a resume resolver.** (session-settled: user-directed — chosen over a shared chooser or dashboard-first entry: returning users should reach their last map immediately.) The resolver sends map-less accounts to `/project/new` and treats All Maps as secondary navigation.
- KTD2. **Use an account-scoped last-project pointer.** (session-settled: user-approved — chosen over browser-local resume state: the same account should resume consistently across devices.) Add a one-row-per-user project-state table whose composite foreign key enforces that the pointed project belongs to the same user; deleting the pointed project removes the state row so fallback remains explicit.
- KTD3. **Store one pointer, not per-project open timestamps.** A pointer preserves the specified fallback: when the remembered project is deleted or invalid, the resolver deliberately chooses the newest available project instead of promoting a previously opened but older project.
- KTD4. **Record editor activation through an explicit open mutation.** Keep `GET /api/projects/[id]` read-only, then let the active editor call `POST /api/projects/[id]/open` once after a successful load. The endpoint performs one ownership-qualified insert/upsert statement, treats the last committed successful mutation as authoritative across tabs or devices, and never touches `projects.updatedAt`.
- KTD5. **Resolve `/app` through a small client navigation gate backed by a server-selected target.** The server authenticates and computes one validated internal resume/fallback destination. The client applies exactly one `replace` after checking precedence: a valid legacy query intent wins, then legacy `#start` chooses the creation workspace, then the server destination wins.
- KTD6. **Represent the chooser as an editor-style empty project route.** (session-settled: user-directed — chosen over a modal or side panel: creation options should live in the editor context.) Keep `/project/new` separate from the large existing editor component, but reuse its navigation language, responsive frame, and visual tokens.
- KTD7. **Require a user action or one-shot intent before blank creation.** A bare or reloaded `mode=blank` URL must not POST repeatedly; chooser clicks may create immediately, while legacy auto-create uses the existing consumable session marker and otherwise exposes an explicit Create blank map action.
- KTD8. **Copy static curated templates through the normal project POST.** (session-settled: user-directed — chosen over seeded personal templates or a marketplace: built-ins should stay read-only and small.) A typed code catalog supplies valid canvas JSON; the picker labels curated and personal sources but returns one creation payload shape.
- KTD9. **Preserve the personal-template API boundary.** `/api/templates` remains an authenticated owner-only API for mutable personal templates. Built-ins remain available when that request is empty or fails, and no built-in ID is accepted by personal template mutation routes.
- KTD10. **Retain All Maps as a management view.** (session-settled: user-directed — chosen over deleting the dashboard entirely: users still need a project library.) Move the list/delete behavior to `/app/maps`, remove start-card and source-form responsibilities, and keep its order based on content `updatedAt`.
- KTD11. **Use the existing analytics event vocabulary.** Record `project_start_selected` at `location: "editor"` and rely on event timestamps plus `first_map_viewed` for funnel timing; do not add identifiers or uploaded/source data to analytics properties.
- KTD12. **Do not mutate a subject account's resume state during admin impersonation.** `/app` may resolve the impersonated account's existing pointer so the admin sees that user's experience, but the open endpoint returns success without changing the subject's preference when `impersonatedBy` is present.

### High-Level Technical Design

```mermaid
flowchart TB
  Public[Public Start a map] --> Auth[Authentication with callback /app]
  Auth --> Entry[/app resolver]
  Entry --> Legacy{Legacy start intent?}
  Legacy -->|yes| NewRoute[/project/new canonical mode]
  Legacy -->|no| Pointer{Owned remembered project?}
  Pointer -->|yes| Editor[Project editor]
  Pointer -->|no| Fallback{Any owned project?}
  Fallback -->|newest| Editor
  Fallback -->|none| NewRoute
  Editor --> Open[POST project open]
  Open --> Record[Atomic owned-pointer upsert]
  Editor -->|New map| NewRoute
  Editor -->|All Maps| Library[/app/maps]
  NewRoute --> Choice{Source choice}
  Choice --> Blank[Blank]
  Choice --> Requirements[Requirements plus BYOK]
  Choice --> Repository[Repository plus BYOK]
  Choice --> Template[Curated or personal template]
  Blank --> Create[POST /api/projects]
  Requirements --> Create
  Repository --> Create
  Template --> Create
  Create --> Editor
```

The persistent resume seam consists of a project-state table, ownership-qualified helpers, and one explicit open endpoint.
The route seam consists of a server-derived destination plus a client resolver for fragment compatibility.
The creation seam uses a server route wrapper for canonical query state and a focused client workspace for file, session, POST, and BYOK behavior, while leaving repository analysis and editor internals unchanged.

### Resume State and Ordering

- Create `user_project_state` with `user_id` as its primary key and a foreign key to `users(id)` with `ON DELETE CASCADE`, plus `last_opened_project_id` as a nullable project pointer.
- Add a unique parent key on `projects(user_id, id)` and a composite child foreign key from `user_project_state(user_id, last_opened_project_id)` with `ON DELETE CASCADE`. This makes cross-account pointers invalid and removes the preference row when its pointed project is deleted.
- `POST /api/projects/[id]/open` uses the effective authenticated user, suppresses writes during impersonation, and records through one ownership-qualified insert/upsert statement. A missing, deleted, or foreign project returns 404 without leaving a pointer or leaking ownership.
- Resume first joins or revalidates the pointer against `projects.userId`.
- A null, stale, or non-owned pointer falls back to the account's projects ordered by `updatedAt DESC`, then `createdAt DESC`, then `id DESC` for deterministic ties. Any stale cleanup compares the observed value before clearing so it cannot erase a newer concurrent open.
- All Maps retains its existing `updatedAt` ordering and does not expose or sort by resume state.
- Concurrent tabs and devices use last committed successful open-mutation wins semantics.
- SQLite foreign-key enforcement remains enabled for production and test connections; migration verification includes `foreign_key_check`.

### Canonical Route Contract

- `/app` means resume work.
- `/app/maps` means browse and manage all maps.
- `/project/new` means show the editor-style chooser.
- `/project/new?mode=<method>` means show or continue that source-specific state; `blank` is now a supported mode.
- `/project/new?mode=repository&repo=<owner/repo>` preserves only a validated public GitHub slug.
- `/project/new?returnTo=/project/<id>` enables cancel back to the originating editor. A dedicated helper accepts only the exact project route shape, preserves it through source and Anthropic setup transitions, and relies on the destination editor's ownership check; `safeInternalPath` still rejects external, scheme-relative, backslash, and malformed values.
- Current `/app?start=blank`, `/app?repo=<slug>#start`, and `/app#start` links canonicalize to `/project/new` without creating from URL presence alone. Query intent takes precedence over the fragment, and either takes precedence over normal resume.
- Unsupported modes fall back to `/project/new` rather than bouncing through `/app`.
- Resume navigation marks its project destination as resolver-originated. If that project is deleted before the editor GET, the client performs one guarded return through `/app` to select the next owned map or chooser; direct visits to arbitrary missing project URLs retain the normal not-found behavior.

### Creation Workspace States

- **Chooser:** Four equal source cards, a clear All Maps escape, and a safe cancel destination when entered from an editor.
- **Blank:** Immediate creation from a chooser gesture; an explicit fallback action for direct/reloaded mode URLs; one busy state and one retryable creation error.
- **Requirements:** `.md` and `.txt` validation, empty/read failures, project naming from the first non-empty heading, BYOK check, and setup continuation.
- **Repository:** Existing public GitHub normalization, prefilled valid slug, validation, BYOK check, setup continuation, and creation errors.
- **Template:** Embedded curated and personal sections, curated availability independent of personal API state, selection busy state, copy error/retry, and source-switch/cancel controls.
- **Navigation:** Browser Back remains meaningful; switching source replaces or updates canonical query state without creating a project.

### Built-In Template Contract

- Define a typed, immutable catalog in `src/lib/starter-templates.ts` with stable namespaced IDs such as `starter:web-app`.
- Ship three generic starters that demonstrate distinct map shapes, for example Web application, Service architecture, and Event-driven pipeline.
- Store each canvas using the same serialized nodes/edges shape accepted by `POST /api/projects`; validate parsing and ID uniqueness in unit tests.
- Present built-ins as StackHatch starters and personal records as Your templates.
- A personal-template request failure shows its own retry state while built-ins remain usable.
- Project creation copies only name, optional description, and serialized canvas data; it does not persist template provenance in this scope.

### System-Wide Impact

- **Data lifecycle:** One nullable per-user pointer is added. Project or user deletion cascades the preference row, while existing project rows and timestamps are not rewritten. The additive migration needs no backfill.
- **Authentication and authorization:** Every pointer read and write uses the effective authenticated user and revalidates project ownership. Redirect destinations and `returnTo` values remain internal-only.
- **Impersonation:** Resolving the subject account's existing destination is allowed, but editor activation never rewrites that subject's resume state while impersonation is active.
- **Caching and navigation:** `/app` is user-specific and must remain dynamic. The resolver may show a minimal status shell during client fragment resolution but must not flash the old dashboard or another project.
- **Creation behavior:** Existing map POST semantics remain authoritative. Consolidation removes duplicate client implementations without changing repository scans, chat, autosave, or project quotas.
- **Analytics and privacy:** The change moves event location from launchpad/dashboard to editor and preserves the fixed property allowlist.
- **Accessibility:** Replacing a template modal with embedded content removes modal focus trapping from this flow; source changes still need deterministic focus placement and status announcements.

### Assumptions

- “Newest available” means the owned project with the greatest content `updatedAt`, using `createdAt` and `id` only as deterministic tie-breakers.
- A project counts as opened when its authenticated detail API returns 200, even if its stored canvas JSON is absent or cannot be parsed and the editor uses its existing fallback state.
- The active editor sends one open mutation after that successful detail response; last committed successful mutation defines ordering when opens overlap.
- Curated starter content is generic product content and does not require server administration or localization in this release.
- The current personal template schema and project canvas payload are stable enough to share a presentation type after adding a curated/personal source discriminator.
- No external links are known to require automatic blank creation without the existing one-shot session intent; safety against duplicate projects takes precedence for manually entered URLs.

### Risks and Mitigations

- **Resume loops or flashes:** A server-only redirect cannot inspect `#start`. Keep the fragment check in a narrow client resolver and cover both default and legacy paths in component and browser tests.
- **Cross-account pointer leakage:** A pointer alone is not authorization. Join or revalidate `project.userId` on read and write, and test foreign, deleted, and impersonated users.
- **Delete/open races:** Use one ownership-qualified pointer mutation and a composite database constraint. A concurrent delete produces a controlled not-found/no-op result rather than a dangling pointer or unexplained 500.
- **Delete after resume resolution:** Mark resolver-originated editor navigation and permit one re-resolution on 404, with a loop guard so repeated deletion settles at the chooser or normal not-found state.
- **Duplicate blank projects:** Never create solely because `mode=blank` is present. Consume the existing one-shot intent or require the visible action, and disable repeat submissions.
- **Template API failure hiding useful starts:** Treat built-ins and personal templates as independently available sections; do not make built-ins wait on a successful fetch.
- **Large editor refactor:** Do not extract the 1,000-plus-line project editor into the creation workspace. Share only small navigation/style seams and keep the existing editor behavior stable.
- **Landing-page regression:** Removing the four-cell launchpad changes responsive composition and copy. Retain the existing product proof sections and cover desktop, mobile, dark, and reduced-motion layouts.

### Sequencing

1. Add and verify durable resume state and the explicit open endpoint.
2. Consolidate the creation workspace and canonical route helpers so `/project/new` no longer bounces to `/app#start`.
3. Introduce `/app/maps`, then activate the `/app` resolver after its no-map destination exists.
4. Add curated templates to the embedded template state.
5. Simplify the public entry, remove obsolete launchpad code, and finish cross-surface browser coverage.

### Research Breadcrumbs

- `src/db/schema.ts` defines project ownership, timestamps, user settings, and personal templates.
- `src/db/migrate.ts` and `src/db/migrate.test.ts` establish migration execution and preservation tests.
- `src/app/api/projects/route.ts` owns project creation and the content-updated project list.
- `src/app/api/projects/[id]/route.ts` is the authenticated editor-load seam and already uses `getAccessibleProject`.
- `src/lib/project-start.ts` centralizes start methods, safe internal paths, and one-shot blank intent.
- `src/components/DashboardPage.tsx` and `src/app/project/new/page.tsx` contain the duplicated creation behavior to consolidate.
- `src/components/templates/TemplatePicker.tsx` and `src/app/api/templates/route.ts` define current personal-template behavior and ownership.
- `src/app/project/[id]/page.tsx` contains the existing New Project and dashboard navigation that must be renamed without broad editor refactoring.
- `src/lib/analytics.ts` fixes the privacy-safe event and property vocabulary.
- No `CONCEPTS.md` or `docs/solutions/` corpus exists, so there are no institutional learnings to preserve.

---

## Implementation Units

### U1. Persist and resolve account resume state

- **Goal:** Add the authenticated, deletion-safe last-opened project pointer and deterministic fallback helpers.
- **Requirements:** R1, R2, R3; F1; AE1, AE2.
- **Files:** Modify `src/db/schema.ts`, `src/db/migrate.test.ts`, `src/app/api/projects/projects-api.test.ts`, `src/app/project/[id]/page.tsx`, and `src/app/project/[id]/page.test.tsx`; create the next generated `drizzle/*.sql` migration and matching `drizzle/meta/*` artifacts; create `src/lib/project-resume.ts`, `src/lib/project-resume.test.ts`, and `src/app/api/projects/[id]/open/route.ts`.
- **Approach:** Add `user_project_state` plus the composite parent key; generate the migration rather than hand-editing snapshots; expose mandatory helpers to resolve pointer-then-newest fallback and perform an atomic ownership-qualified upsert; have the editor call the open endpoint once after successful load; suppress impersonation writes; keep project `updatedAt` untouched; compare before clearing stale state.
- **Patterns:** Follow `runMigrations`, `getAuthenticatedUserId`, `getAccessibleProject`, and the database setup in `src/app/api/projects/projects-api.test.ts`.
- **Test scenarios:** Apply migrations through `0004` to representative users/projects, then apply the new migration and verify null initial state, indexes, composite ownership, both cascades, rerun safety, and `foreign_key_check`; update the hand-built API test schema with the new table and keys; owner open records once; unauthenticated, missing, foreign, and impersonated opens do not mutate; a delete racing the ownership-qualified write yields controlled 404/no state; simultaneous opens use last committed mutation wins; stale compare-and-clear cannot erase a newer pointer; resume chooses the pointer over a newer update; invalid pointer falls back deterministically; project `updatedAt` does not change.
- **Operational notes:** Confirm production and test database factories retain `foreign_keys = ON`. The migration is additive and the previous app tolerates the extra table; if migration application fails, restore the database backup or roll forward rather than assuming a generated down migration exists.
- **Verification:** Targeted migration, helper, and project API tests pass, and the generated schema artifacts match the declared Drizzle schema.
- **Dependencies:** None.

### U2. Turn `/app` into resume and move the library to All Maps

- **Goal:** Establish the new route semantics and preserve project browsing as a secondary view.
- **Requirements:** R1, R2, R4, R10, R12, R13; F1, F2, F5; AE2, AE3.
- **Files:** Modify `src/app/app/page.tsx`, `src/components/DashboardPage.tsx`, `src/components/DashboardPage.test.tsx`, `src/app/project/[id]/page.tsx`, `src/app/project/[id]/page.test.tsx`, and affected admin navigation; create `src/app/app/maps/page.tsx` and a small `/app` resolver component/test; rename `DashboardPage` to `AllMapsPage` and its test as part of removing dashboard semantics.
- **Approach:** Keep `/app/page.tsx` responsible for authentication and server-side resume selection; pass only one validated internal destination to a minimal client resolver that applies legacy query/hash precedence and one `replace`; mark resolver-originated project navigation and recover once through `/app` if the target disappears before load; strip creation forms/cards and blank auto-create from the library; add a single New map action; update editor navigation labels and destinations.
- **Patterns:** Reuse authenticated server helpers from `src/lib/auth.ts`, list/delete behavior from `DashboardPage`, status-shell conventions from current redirecting pages, and the editor's existing minimum-touch navigation links.
- **Test scenarios:** Pointer target, newest fallback, and no-project destinations; query intent precedes `#start`, and `#start` precedes normal resume; `/app#start` reaches the chooser; deletion after pointer or fallback selection re-resolves once without looping; `/app/maps` loads only owned maps, preserves `updatedAt` order, retries load failure, deletes with confirmation, and exposes New map; editor All Maps and New map links use the new routes; admin exit navigation resumes rather than implying a dashboard.
- **Verification:** Resolver, All Maps, editor navigation, and project-list tests pass without changing editor canvas behavior.
- **Dependencies:** U1, U3.

### U3. Consolidate all creation methods in the editor-style workspace

- **Goal:** Replace dashboard/new-page duplication with one canonical chooser and source-specific creation flow.
- **Requirements:** R4, R5, R6, R7, R11, R12, R13, R14; F2, F3; AE3, AE4, AE5, AE7.
- **Files:** Modify `src/app/project/new/page.tsx`, `src/app/project/new/page.test.tsx`, `src/lib/project-start.ts`, `src/lib/project-start.test.ts`, `src/components/AuthStartForm.tsx`, `src/components/AuthStartForm.test.tsx`, `src/app/login/page.tsx`, relevant login tests, `src/app/settings/page.tsx`, and its test; create `src/components/projects/ProjectStartWorkspace.tsx` and a focused component test, plus a dedicated project-return helper if it does not fit cleanly in `src/lib/project-start.ts`.
- **Approach:** Make `src/app/project/new/page.tsx` a server wrapper that canonicalizes and sanitizes query state, with `ProjectStartWorkspace` owning file, session, project POST, and BYOK state; support null/blank/requirements/repository/template modes; centralize project POST and name derivation; preserve a project-route-only `returnTo` through source, repository, and Anthropic setup transitions; move start analytics to `location: "editor"`; remove `/app#start` bounce behavior before `/app` resume activates.
- **Patterns:** Reuse current file validation, `parseGitHubRepoReference`, `safeInternalPath`, settings setup links, `markProjectStart`, and retry/error copy. Keep the project API payload unchanged.
- **Test scenarios:** Chooser exposes four keyboard-reachable methods; blank creates once from a gesture and direct reload does not duplicate; invalid mode returns to chooser; requirements validation and first-heading name; repository preload/normalization; missing-key continuation for both AI starts; safe cancel returns to the originating editor; unsafe return falls back to All Maps or chooser; project POST/network failures remain recoverable; auth completion retains the privacy-safe method marker.
- **Verification:** New-project, route-helper, auth-start, and login tests pass, and all four starts reach a new project editor in focused browser coverage.
- **Dependencies:** U1.

### U4. Add curated built-in starter templates

- **Goal:** Ensure the template path is useful before a user has saved a personal template while keeping built-ins immutable.
- **Requirements:** R7, R8, R13; F3; AE6.
- **Files:** Create `src/lib/starter-templates.ts` and `src/lib/starter-templates.test.ts`; modify `src/components/templates/TemplatePicker.tsx`, `src/components/templates/TemplatePicker.test.tsx`, `src/app/project/new/page.tsx`, and `src/app/project/new/page.test.tsx`; modify shared template types if introduced.
- **Approach:** Define three valid static starter records with a `curated` source discriminator; reshape the picker from modal-only chrome into embedded categorized content; fetch personal templates independently; normalize both sources to the callback shape; copy selected canvas state through `POST /api/projects` without mutating `/api/templates`.
- **Patterns:** Preserve `summarizeTemplate`, personal-template response shape, selection busy/error/retry behavior, and existing project-copy naming conventions.
- **Test scenarios:** Built-in IDs are unique and every canvas parses; built-ins render before/without personal templates; personal and curated sections are labeled; personal fetch failure leaves built-ins usable and offers retry; selection creates one personal project copy; no Anthropic settings request is made; built-ins never appear as mutable personal API records.
- **Verification:** Starter catalog, picker, new-project integration, and unchanged template API ownership tests pass.
- **Dependencies:** U3.

### U5. Simplify the public entry and complete compatibility coverage

- **Goal:** Present one public Start a map action, remove obsolete launchpad code, and prove the end-to-end transition across routes and viewports.
- **Requirements:** R9, R11, R12, R13, R14; F4; AE5, AE7.
- **Files:** Modify `src/app/page.tsx`, `src/app/page.test.tsx`, `src/app/landing.module.css`, `e2e/launch-experience.test.ts`, `e2e/new-project.test.ts`, and any affected `e2e/full-flow.test.ts` or `e2e/tierless-byok.test.ts`; delete `src/components/public/PublicStartLaunchpad.tsx` and `src/components/public/PublicStartLaunchpad.test.tsx` after all callers and assertions are removed.
- **Approach:** Replace the four-cell launchpad and repository form with one CTA to the authenticated `/app` continuation; update hero/workflow copy without erasing the four supported input types; remove obsolete styles; rewrite browser tests around resume, chooser, All Maps, legacy compatibility, and built-in templates; retain the existing product-proof sections and responsive behavior.
- **Patterns:** Reuse current landing CTA/link styles, login callback handling, Playwright auth setup, dark/reduced-motion assertions, and analytics privacy tests.
- **Test scenarios:** Anonymous CTA reaches login with `/app` continuation; authenticated visitor resumes or sees chooser; no public method-specific controls remain; valid legacy routes canonicalize; desktop, 390px, and 320px layouts remain usable; dark and reduced-motion modes remain readable; first-map and returning-map browser journeys complete; public repository values never leak into analytics.
- **Verification:** Landing unit tests and focused Playwright suites pass at configured desktop/mobile projects, with obsolete launchpad imports, selectors, styles, and copy removed.
- **Dependencies:** U2, U3, U4.

---

## Verification Contract

| Gate                     | Command                                                                                                                                                                                                                                                                                                                       | Proves                                                                                                                                 | Applies after |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| Formatting               | `npm run format:check`                                                                                                                                                                                                                                                                                                        | Modified TypeScript, CSS, SQL metadata, and Markdown follow repository formatting.                                                     | Every unit    |
| Static types             | `npm run typecheck`                                                                                                                                                                                                                                                                                                           | Route props, Drizzle relations, template discriminators, and client/server boundaries are valid.                                       | U1-U5         |
| Lint                     | `npm run lint`                                                                                                                                                                                                                                                                                                                | React effects, accessibility-sensitive JSX, imports, and dead code satisfy repository rules.                                           | U2-U5         |
| Focused unit/integration | `npm test -- src/db/migrate.test.ts src/lib/project-resume.test.ts src/app/api/projects/projects-api.test.ts src/lib/project-start.test.ts src/app/project/new/page.test.tsx src/components/templates/TemplatePicker.test.tsx src/components/DashboardPage.test.tsx src/app/project/[id]/page.test.tsx src/app/page.test.tsx` | Migration, ownership, resolver, creation, template, navigation, and landing contracts. Adjust paths for intentional component renames. | During U1-U5  |
| Full Vitest suite        | `npm test`                                                                                                                                                                                                                                                                                                                    | Existing project, auth, settings, analytics, templates, and editor behavior remains compatible.                                        | After U5      |
| Focused browser suite    | `npm run test:e2e -- e2e/new-project.test.ts e2e/launch-experience.test.ts e2e/full-flow.test.ts e2e/tierless-byok.test.ts`                                                                                                                                                                                                   | Real navigation, authentication continuation, BYOK, responsive UI, and all four creation paths.                                        | After U5      |
| Full browser suite       | `npm run test:e2e`                                                                                                                                                                                                                                                                                                            | No project, admin, error-path, smoke, or personal-tools journey regresses outside the focused files.                                   | Final         |
| Production build         | `npm run build`                                                                                                                                                                                                                                                                                                               | Next.js server/client boundaries, dynamic authenticated routing, and production compilation succeed.                                   | Final         |

`release:validate` does not apply because the repository defines no such script.
Manual browser verification supplements automation for focus movement after source changes, browser Back/cancel behavior, absence of a dashboard flash on `/app`, and the template layout at desktop and 320-390px widths.

---

## Definition of Done

### Global Completion

- `/app`, `/app/maps`, and `/project/new` implement the route contract without redirect loops, cross-account data exposure, duplicate blank projects, or content timestamp mutation on open.
- All four creation methods share one editor-style workspace and preserve their existing validation, BYOK, retry, and project-copy behavior.
- Curated templates are immutable code assets, remain usable during personal-template failures, and create ordinary personal projects.
- The public site has one Start a map CTA, while All Maps remains available inside the authenticated application.
- Valid legacy entry URLs have regression coverage and unsafe input falls back through `safeInternalPath` and repository validation.
- Analytics remains privacy-safe and supports comparison of first-map and return-to-work timing using existing event timestamps.
- Every verification gate passes; any intentionally renamed test paths are reflected in the final commands and CI configuration.
- Abandoned experiments, duplicated dashboard creation code, obsolete launchpad components/styles/tests, unused session markers, and stale copy are removed from the final diff. A repository search finds no obsolete `/app#start` bounces, `DashboardPage` names, dashboard-located start analytics, launchpad selectors, or public-launchpad imports.
- The implementation is tracked in `bd`, completed issue state is synced, changes are committed and rebased, `git push` succeeds, and `git status` confirms the branch is up to date with its remote.

### Unit Completion

- U1 is done when migrated databases preserve existing data, the explicit open mutation records only authorized non-impersonated resume state, deletion removes the preference row, and fallback ordering is deterministic.
- U2 is done when `/app` resumes or selects the correct destination, `#start` remains compatible, and `/app/maps` contains only map-management responsibilities.
- U3 is done when chooser, cancel, all four modes, BYOK continuations, safe returns, and duplicate prevention pass unit and focused browser tests.
- U4 is done when the curated catalog is valid and immutable, personal-template errors are isolated, and both template sources create normal project copies.
- U5 is done when one public CTA replaces the launchpad, obsolete code is deleted, and the complete first-time and returning-user journeys pass responsive browser coverage.
