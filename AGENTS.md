# Repository Guidelines

## Project Overview

StackHatch is a free, MIT-licensed, **local-first architecture-map editor**. Users start from a blank canvas, a Markdown/text brief, or a GitHub repository (public; private with an optional fine-grained token), then edit, question, and export the map. It is a **Next.js static export**: no account, server, database, analytics, or StackHatch API. Maps live in IndexedDB. GitHub and the AI provider (BYOK: Anthropic, OpenAI, Google Gemini, OpenRouter) are called directly from the browser, only after an explicit user action.

Hard product constraints (README.md, docs/features.md, SECURITY.md). Do not break them without explicit product approval:

- **No backend or telemetry.** No auth, server routes, server-side provider proxy, runtime secrets, or analytics.
- **Keys and GitHub token.** Provider keys and the optional `github_pat_` token (`src/lib/github-token.ts`) live in session memory by default. Remembering one is explicit, device-local, and reversible (credential DB `stackhatch-credentials` v2, shared by keys and token; credentials added later are seeded when the store opens, not via a version bump). Never put them in backups, provider-run records, env files, logs, or fixtures. The token is sent only to `api.github.com`. Provider registry: `src/lib/ai/providers.ts`; model preference is stored as `provider:model` (bare legacy ids mean Anthropic).
- **CSP boundary.** `connect-src` is exactly: self, `api.github.com`, `api.anthropic.com`, `api.openai.com`, `generativelanguage.googleapis.com`, `openrouter.ai`. Adding a provider means updating `CONNECT_ORIGINS` (and `NAVIGATION_ORIGINS` for key-console links) in `scripts/static-policy.mjs` **and** the deliberately duplicated `APPROVED_CONNECT_ORIGINS` in `scripts/static-policy-checks.mjs`; otherwise the build fails. Inline scripts only via build-time hashes.
- **Untrusted input.** GitHub content and imported backups are untrusted. Generated maps are inference from bounded evidence, not audits.

## Architecture & Data Flow

```
/app ─ AppResolver ─▶ last-opened map or /project/new
/project/#<id> ─ project/page.tsx (editor orchestrator, ~2.5K lines)
   React Flow state ⇄ src/types/canvas.ts (Stack* ⇄ RF nodes/edges)
   └─ canvas-persistence.ts (500 ms debounce; flushLatest / suspendAndFlush / persistReplacement)
        └─ vault/workspace.ts ─ vault/repository.ts ─ IndexedDB "stackhatch-vault" v4
AI:     provider-run.ts ─ context-builder ─ browser-client (Anthropic SDK) | chat-completions-client
        (OpenAI/Gemini/OpenRouter) ─ output-parser (Zod) ─ atomic commit
GitHub: github-analyzer.ts (REST, anonymous unless token set, bounded evidence) ─ provider-run
```

- **Project identity is the URL fragment** (`/project/#<id>`, `src/lib/app-route.ts`). Static hosts never see it; a dynamic segment would break static export.
- **Vault schema v4** (`src/lib/vault/schema.ts`, migrations in `upgradeVaultSchema` in `indexed-db.ts`). Stores: `meta`, `projects`, `messages`, `preferences`, `resume`, `repositoryEvidence`, `repositoryProvenance`, `providerRuns`. v3 dropped the `templates` store; v4 adds optional edge `sides` (manual attachments) with no backfill. Schema changes need a version bump, a migration step, and an update to backup parsing (`vault/backup.ts`, `BACKUP_FORMAT_VERSION = 2`).
- **Concurrency is explicit.** Writes carry `expectedGeneration` plus `expectedRevision`/`expectedProjectRevision`. Stale writes throw `VaultConflictError` / `VaultSnapshotConflictError` / `VaultGenerationConflictError`; never last-write-wins. Cross-tab: Web Locks + BroadcastChannel (`vault/coordination.ts`). Re-scans, AI commits, and restores MUST go through the persistence flush/suspend barriers or stale editor snapshots overwrite committed state.
- **AI run sequence** (`src/lib/ai/`):
  1. Capture the bundle under the project lock; resolve provider/model from the `provider:model` preference.
  2. Persist a provider-run record (no key, no stream chunks).
  3. Stream: Anthropic SDK (`dangerouslyAllowBrowser`, `maxRetries: 0`, `exactOriginFetch`) or Chat Completions fetch (fixed origin, key only in `Authorization`, `redirect: "error"`, no retries).
  4. Extract `<stack>…</stack>` JSON; validate with Zod + graph-reference checks.
  5. Commit with preconditions. On failure the prior map is kept (`ProviderRunStaleError` if superseded).
- **Exports vs. backups.** PNG/SVG come from the React Flow DOM via `html-to-image`; JSON/YAML are diagram exports. `.stackhatch.json` and full-vault backups are checksummed, strictly validated, previewed, then restored atomically (`BackupRestorePanel`).

## Key Directories

- `src/app/`: routes `/`, `app/`, `app/maps/`, `project/`, `project/new/`, `settings/`, `support/`, `privacy/`, `terms/`. `globals.css` holds all design tokens; `*.module.css` only for landing/public layout.
- `src/components/`: `canvas/` (nodes, edges, detail panel, toolbars, exports, `EditorDisplaySettings`), `chat/` (`ResizableChatSidebar`), `shells/` (`AppBar`, `AppPageShell`, `PublicChrome`, `PublicPageShell`, `StackHatchWordmark`), `ui/` (`IconControl`, `Modal`, `Toast`, `useFocusTrap`), `settings/` (`ProviderKeyField`, `GitHubTokenField`, backup), `projects/` (`ProjectStartWorkspace`, `AllMapsPage`, `MapThumbnail`).
- `src/lib/`: `vault/` persistence; `ai/` provider pipeline (incl. `context-builder.ts`); `github-analyzer.ts`, `github-token.ts`, `provider-key.ts`; canvas geometry (`layout.ts` dagre, `layout-motion.ts`, `edge-anchors.ts`, `node-collision.ts`, `merge-architecture.ts`); start (`project-start.ts`); input handling (`chat-attachment.ts`, `requirements-file.ts`, `sanitize-html.ts`); `node-config.ts`, `custom-subtypes.ts`, `canvas-limits.ts`.
- `src/types/`: `stack.ts` (domain graph), `canvas.ts` (React Flow mapping), `chat.ts`.
- `e2e/`: Playwright suites; `e2e/helpers/sse-mock.ts` holds shared flows and network fakes.
- `scripts/`: CSP/header generation and verification, release candidate, repo eval, `arvo-dev.sh`, `computed-style-snapshot.mjs` (before/after computed-style diffs across routes/themes).
- `static-host/Caddyfile.template`: production headers template.

## Development Commands

```bash
npm ci
npm run dev                 # next dev on port 3000, or the next free port if 3000 is taken
scripts/arvo-dev.sh         # reuse running dev server (.next/dev/lock) or start on first free port ≥3000
npm test                    # vitest run (src/**/*.test.ts(x) + scripts/**/*.test.mjs)
npx vitest run src/lib/vault/repository.test.ts -t "conflict"
npm run typecheck           # tsc --noEmit
npm run lint                # eslint .
npx prettier --check <files>   # avoid `npm run format`: it rewrites the whole tree
npm run build               # next build → out/, static:policy (CSP hashes, dist-host/Caddyfile, out/_headers), verify:static
npx playwright test --reporter=line
npx playwright test e2e/smoke.test.ts -g "blank map"
npm run release:build       # Docker candidate image (refuses dirty tracked files)
npm run test:e2e:static     # E2E against that candidate (needs release:build first)
npm run release:manifest    # dist-release/ manifest; image revision must equal HEAD
docker compose up --build prod   # Caddy-only production container on :3000 (prod has no profile; binds all interfaces)
npm run eval:repositories   # opt-in, Anthropic-only; reads ANTHROPIC_API_KEY, STACKHATCH_EVAL_MODEL
```

## Code Conventions & Common Patterns

- **Formatting:** Prettier: double quotes, semicolons, ES5 trailing commas, 2 spaces, 100 columns. TypeScript `strict`, `moduleResolution: bundler`. Import `src/` via `@/`.
- **Naming:** domain types `Stack*`; vault records `Vault*Record`; components PascalCase files; hooks in `use-*.ts` exporting `useX` (exceptions: `ui/useFocusTrap.ts`, `useEditorDisplaySettings` in `EditorDisplaySettings.tsx`; follow `use-*.ts` for new hooks); routes `page.tsx`; tests colocated `<module>.test.ts(x)`.
- **Errors:** throw typed `Error` subclasses: `VaultError` family (`storage-status.ts`: `VaultUnavailableError`, `VaultCommitError`, `VaultConflictError`, `VaultSnapshotConflictError`, `VaultGenerationConflictError`, `VaultValidationError`), `ProviderError`, `ProviderRunStaleError`, `ProviderKeyUnavailableError`, `RepoAnalysisError` (with `RepoAnalysisErrorCode`), `BackupValidationError`, `ChatAttachmentError`, `CustomSubtypesValidationError`. Normalize unknown SDK/IndexedDB errors (`normalizeVaultError`, `provider-errors.ts`). UI maps errors to accessible alerts/toasts. Never swallow a conflict as success. No `Result` type.
- **Async:** promises; streaming is `AsyncIterable` + `AbortSignal`.
- **Dependency injection:** factories (`createVaultRepository`, …) accept repository, key manager, `fetch`, clock, ID generator, lock manager, analyzer; browser singletons (`getBrowserVaultRepository`) wrap them. Add dependencies through these seams, not globals; tests fake them the same way.
- **State:** editor state is hooks and refs in `project/page.tsx`; no global store; narrow contexts (e.g. `EditorDisplaySettingsProvider`). The persistence coordinator owns save sequencing; don't duplicate canvas state.
- **Validation:** Zod for provider output; manual exact-key/bounds checks for backups. Clamp names, text, IDs to `canvas-limits.ts` / `backup-limits.ts`.
- **Styling:**
  - Tailwind v4 semantic tokens via `@theme inline` (`bg-paper`, `text-ink2`, `border-rule-strong`, `bg-frame`, `bg-tag-client`, …). No literal hex in components. Type roles are `type-*` utilities; shared controls are `btn`, `frame-btn`, `field-*`, `menu`.
  - New tones go in `src/app/globals.css` with both `:root` and `.dark` values.
  - Global element rules go inside `@layer base`; unlayered rules override utilities.
  - Shared shells use BEM-like classes (`.app-bar__crumb`, `.ink-frame__divider`, `.icon-control__tooltip`).
  - Theme: `next-themes` with `class`; use `useHydrated` to avoid hydration mismatches.
- **Design authority:** `.impeccable.md` (principles: warm earthy tones; no gradient text, glassmorphism, generic blue/purple) and `docs/design/workbench/README.md` (live Workbench system: ink frame, docked panels, ochre primary, `type-*` roles, shared classes). No tracked-caps eyebrows or numbered markers on non-sequences; no helper copy under labels by default.
- **Text:** English inline; no i18n.

## Important Files

- **Entry/routing:** `src/app/layout.tsx` (fonts: Archivo display, Atkinson Hyperlegible Next body, IBM Plex Mono utility), `src/components/AppResolver.tsx`, `src/app/project/page.tsx`, `src/lib/app-route.ts`.
- **Persistence:** `src/lib/vault/{schema,indexed-db,repository,workspace,coordination,backup,storage-status}.ts`, `src/lib/canvas-persistence.ts`.
- **AI:** `src/lib/ai/{providers,provider-run,browser-client,chat-completions-client,provider-stream,provider-errors,context-builder,output-parser,system-prompt,default-prompts}.ts`; keys/token: `src/lib/provider-key.ts`, `src/lib/github-token.ts`.
- **Build/security:** `next.config.ts` (`output: "export"`, `distDir: NEXT_DIST_DIR || ".next"`, unoptimized images), `scripts/static-policy.mjs` (CSP source of truth), `scripts/static-policy-checks.mjs` (independent validators, secret patterns, digest-pinned images), `scripts/verify-static-output.mjs`, `static-host/Caddyfile.template`, `Dockerfile` (digest-pinned `node:22-alpine` → `caddy:2.10.0-alpine`, uid 1001).
- **Current docs:** `docs/features.md`, `docs/design/workbench/README.md`, `docs/operations/local-first-*.md`, `docs/plans/2026-10-01-001-feat-private-repository-token-plan.md` (private-repo spec).
- **Stale docs:** `docs/plans/2026-07-30-*` (private-repo parts superseded by the 2026-10-01 plan) and the 2026-07-16/07-24 plans with a "templates retired" status note.
- **Generated, don't hand-edit:** `next-env.d.ts`, `dist-host/`, `out/`, `tsconfig.tsbuildinfo`. Playwright and Next dev runs also reformat `tsconfig.json`; revert with `git checkout tsconfig.json` unless changed on purpose.

## Runtime/Tooling Preferences

- Node ≥ 22, npm ≥ 10 (`packageManager: npm@10.9.7`); npm only, `package-lock.json`. `package.json` `overrides` pin transitive deps (brace-expansion, esbuild, postcss, sharp); keep them when upgrading. Stack: Next 16, React 19, Tailwind 4, ESLint 9 flat config, Vitest 4, Playwright 1.58.
- Playwright uses `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` when set, else `/run/current-system/sw/bin/chromium` if present (NixOS), else its own downloaded browser (`npx playwright install chromium`).
- For extra Next preview runs use a relative, ignored `NEXT_DIST_DIR` (e.g. `.next-playwright`), never an absolute `/tmp` path.
- CI (`.github/workflows/ci.yml`) runs on pushes to `main` and on PRs: `checks` (lint, typecheck, unit tests, build) and `e2e` (Playwright against the runner's `/usr/bin/google-chrome`; the bundled headless shell draws classic scrollbars and breaks 320 px overflow checks). Still run the gates locally before pushing.
- **Deploy is automatic:** a green push to `main` runs the `deploy` job. It builds the Docker image and streams it over SSH to the VPS, where the key may run only `/usr/local/bin/deploy-stackhatch` (installed from `scripts/deploy-stackhatch.sh`; reinstall it there after editing). The script loads the image, swaps the `stackhatch` container (127.0.0.1:8000 behind nginx), rolls back if unhealthy, and keeps the last 3 images. Secrets (`DEPLOY_SSH_KEY`, `DEPLOY_HOST`, `DEPLOY_KNOWN_HOSTS`) live in the `production` environment, which only `main` may use. Actions are pinned to commit SHAs with the version in a comment; update both together.
- Env files only hold `NEXT_PUBLIC_SITE_URL`. Never put provider keys in env files.
- Issues → GitHub issues; vulnerabilities → private reporting (SECURITY.md). `bd`/beads/Dolt steps in `.agents/skills/*` are not used here.

## Testing & QA

- **Unit:** Vitest on jsdom + Testing Library; `src/test/setup.ts` only adds jest-dom and cleanup. Query by role/label. Suites needing real IndexedDB import `fake-indexeddb/auto` themselves with unique DB names (no global fake). `vi.mock` `next/navigation`, `next-themes`, `reactflow`; fake providers/GitHub via injected clients or `fetch` returning synthetic `Response`s. Coverage (`npm run test:coverage`, v8) has no threshold.
- **E2E:** Playwright, Chromium only, serial (`workers: 1`), dev server on **3099** (`PLAYWRIGHT_TEST_PORT`) with distDir `.next-playwright`; `reuseExistingServer` outside CI. Specs: `accessibility`, `ai-providers`, `error-paths`, `full-flow`, `launch-experience`, `navigation`, `new-project`, `personal-tools`, `private-repository`, `smoke`, `tierless-byok`, `typography`, `ui-polish`. `e2e/helpers/sse-mock.ts`: `createBlankMap`, `useProviderKey`, `mockAnthropic`, `mockChatCompletions`, `mockGitHub`, `trackExternalRequests`, `readIndexedDbStore`, `assertNoApplicationCookies`, `openChat`, `sendChatMessage`; origins are literals on purpose (not imported from the registry). Static mode (`PLAYWRIGHT_STATIC=1`) runs `scripts/run-static-candidate.mjs` and enables the headers/404 smoke test.
- **Guard suites:**
  - `src/app/palette.test.ts`: 4.5:1 text, 3:1 non-text, >0.02 greyscale luminance between the seven node categories, both themes; `--hero-slot` identical across themes; solid `:focus-visible` (no `color-mix`).
  - `scripts/static-policy.test.mjs`: env ignores, Docker digests, CSP/headers, provider origins vs `CONNECT_ORIGINS`, secret patterns.
  - `e2e/accessibility.test.ts`: axe (WCAG 2.2 AA tags) on `/`, `/app/maps`, `/project/new`, `/settings`, `/support`, `/privacy`, the editor, and the repo-token start state, in both themes.
- **Before handing off:** `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`, plus E2E for affected journeys.
- **Visual changes:** check light/dark, narrow mobile (320px), keyboard, reduced motion. Maps must not rely on colour alone. Take headless screenshots with the repo's Playwright and the same browser the E2E suite uses.
- **Landing hero** (`src/app/page.tsx`, `HeroTour.tsx`, `landing.module.css`): the light plate (`--hero-slot`, light in both themes) holds a click-to-play 16:9 two-minute tour (poster first, never autoplays, native controls, English captions). Files in `public/video/` (`stackhatch-tour.mp4` 1080p, `stackhatch-tour-720.mp4` ≤760 px, `-poster.webp`, `.en.vtt`) are encoded from the promo video project, which lives outside git (`video/` is ignored); poster is a real editor capture. Below: audience cards, features mosaic, privacy cards (Lucide icons). OG image: `public/screenshots/architecture-overview-og.png` (1200×630).

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
