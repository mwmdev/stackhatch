# Ralph Progress Log

This file tracks progress across iterations. Agents update this file
after each iteration and it's included in prompts for context.

## Codebase Patterns (Study These First)

- **Next.js 16**: `next lint` CLI subcommand removed. Use `eslint .` directly.
- **eslint-config-next v16**: Exports flat config array natively. No need for `@eslint/eslintrc` FlatCompat wrapper.
- **Docker standalone**: `next.config.ts` must have `output: "standalone"` for the production Dockerfile multi-stage build pattern.
- **Tailwind v4**: Uses `@import "tailwindcss"` in CSS instead of `@tailwind` directives. Config via `@tailwindcss/postcss` plugin in `postcss.config.mjs`.
- **Playwright on NixOS**: Downloaded Chromium binaries won't work. Use `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=$(which chromium)` env var to point at system chromium. Config reads from `process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`.
- **Playwright port conflict**: Use a dedicated port (3099) via `PLAYWRIGHT_TEST_PORT` env var to avoid conflicts with other dev servers on 3000.
- **@testing-library/react**: Requires explicit `@testing-library/dom` peer dependency install.
- **Drizzle ORM + better-sqlite3**: Use `drizzle-orm/better-sqlite3` with synchronous driver. Enable `foreign_keys = ON` pragma explicitly (SQLite defaults to OFF). For tests, use in-memory DB with raw SQL schema creation rather than running file-based migrations.
- **Drizzle query API**: The `db.query.*.findMany()` relational API may not work with in-memory DBs without proper schema setup. Prefer standard `db.select().from().orderBy()` with imported `desc`/`asc` helpers from `drizzle-orm`.
- **Next.js App Router dynamic params**: In Next.js 16, dynamic route params are `Promise<{ id: string }>` — must `await params` before accessing `.id`.
- **Playwright SSE mocking**: Use `route.fulfill()` with string body for SSE streams. Don't use `TextEncoder` — Playwright expects `string | Buffer`, not `Uint8Array`.
- **Playwright strict mode**: `getByRole('alert')` conflicts with Next.js route announcer div. Use `getByText()` for specific error messages. Use `.first()` when text may appear in both streaming and finalized message elements.
- **Playwright route priority**: Later-registered routes have HIGHER priority. When mocking both `/chat/init` and `/chat`, register the general `/chat` route first, then the more specific `/chat/init` second. Better yet, use a single `**/chat**` handler that branches on `url.includes("/chat/init")` vs `url.endsWith("/chat")`.
- **React Strict Mode double effects**: In dev mode, Next.js runs React Strict Mode which double-invokes `useEffect`. When mocking E2E flows, don't use a shared counter across init and chat handlers — track init and chat separately to avoid counter being incremented twice by the init effect.
- **@testing-library/react cleanup**: Auto-cleanup doesn't work with vitest unless `globals: true` is set. Add explicit `cleanup()` in `afterEach` in `src/test/setup.ts` to prevent test leakage.
- **lucide-react dynamic icons**: Access icons by name using `(icons as unknown as Record<string, typeof icons.Box>)[name]`. The module exports non-component members too (like `createLucideIcon`), so direct `as Record<string, ComponentType>` casts fail.
- **react-hooks/static-components**: Don't assign icon components to variables during render (e.g., `const Icon = getIcon(name)`). Instead, create a `DynamicIcon` wrapper component that resolves internally.

---

## 2026-02-26 - shastack-ar4.1
- Scaffolded Next.js 16 project with TypeScript (strict), Tailwind CSS v4, ESLint, Prettier
- Created multi-stage Dockerfile (deps → builder → runner) with standalone output
- Created docker-compose.yml with dev (volume-mounted hot reload) and prod profiles
- Set up .env.example, .env.local, .gitignore, .dockerignore
- Custom CSS variables for light/dark theme with category colors
- **Files created:** package.json, tsconfig.json, next.config.ts, postcss.config.mjs, eslint.config.mjs, .prettierrc, .prettierignore, Dockerfile, docker-compose.yml, .env.example, .env.local, .gitignore, .dockerignore, src/app/globals.css, src/app/layout.tsx, src/app/page.tsx
- **Learnings:**
  - Next.js 16 removed `next lint` — use `eslint .` directly
  - eslint-config-next v16 exports flat config natively (array of 3 config objects)
  - Tailwind v4 uses `@import "tailwindcss"` and `@tailwindcss/postcss` plugin
  - Docker context was 564MB without .dockerignore — always add one
  - Next.js auto-updates tsconfig.json on first build (jsx → react-jsx, adds .next/dev/types)
---

## 2026-02-26 - shastack-ar4.2
- Set up complete testing infrastructure: Vitest (unit/component), Testing Library (React), Playwright (E2E)
- Configured vitest.config.ts with jsdom environment, path aliases, v8 coverage
- Configured playwright.config.ts with system chromium support, dedicated port 3099, webServer auto-start
- Created test setup file (src/test/setup.ts) importing jest-dom matchers
- Added npm scripts: test, test:watch, test:e2e, test:coverage
- Wrote smoke tests: Vitest arithmetic, Testing Library render/assert, Playwright page title check
- Added coverage/, test-results/, playwright-report/ to .gitignore and eslint ignores
- **Files created:** vitest.config.ts, playwright.config.ts, src/test/setup.ts, src/test/smoke.test.ts, src/test/component.test.tsx, e2e/smoke.test.ts
- **Files modified:** package.json (scripts + deps), .gitignore, eslint.config.mjs
- **Learnings:**
  - Playwright-downloaded Chromium doesn't work on NixOS — must use system chromium via `executablePath`
  - @testing-library/react v16 doesn't auto-install @testing-library/dom — needs explicit install
  - @vitest/coverage-v8 must match the major vitest version (both ^3.x)
  - Port 3000 is commonly occupied — use a dedicated port for E2E test servers
---

## 2026-02-26 - shastack-ar4.3
- Set up Drizzle ORM with better-sqlite3 for SQLite persistence
- Created schema with 3 tables: projects (6 cols), messages (5 cols with FK cascade), settings (key-value)
- Created db client (`src/db/index.ts`) with singleton pattern and test factory
- Created migration runner (`src/db/migrate.ts`) using drizzle-orm migrator
- Configured `drizzle.config.ts` and generated initial migration
- Added npm scripts: `db:generate`, `db:migrate`
- Wrote 12 unit tests covering all CRUD operations, cascade delete, upsert, ordering
- **Files created:** src/db/schema.ts, src/db/index.ts, src/db/migrate.ts, src/db/db.test.ts, drizzle.config.ts, drizzle/0000_ambiguous_tattoo.sql, drizzle/meta/*
- **Files modified:** package.json (deps + scripts)
- **Learnings:**
  - SQLite `foreign_keys` pragma must be set explicitly per connection — it defaults to OFF
  - Drizzle's relational query API (`db.query.*.findMany`) needs careful schema setup; standard select/insert API is more reliable for tests
  - For in-memory test DBs, apply schema via raw SQL rather than running file-based migrations
  - `drizzle-kit generate` auto-names migrations (e.g., `0000_ambiguous_tattoo.sql`)
---

## 2026-02-26 - shastack-ar4.19
- Implemented the complete new project flow: form → create → redirect → AI interview
- Created API routes: POST/GET /api/projects, GET /api/projects/[id], GET /api/projects/[id]/messages, POST /api/projects/[id]/chat (SSE streaming), POST /api/projects/[id]/chat/init
- Created AI system prompt for architecture interviews (`src/lib/ai/system-prompt.ts`)
- Created new project form page (`src/app/project/new/page.tsx`) with client-side validation
- Created project page (`src/app/project/[id]/page.tsx`) with two-panel layout (chat sidebar + canvas placeholder)
- Created ChatSidebar component (`src/components/chat/ChatSidebar.tsx`) with SSE streaming, markdown rendering, auto-scroll, typing indicator
- Chat sidebar opens by default for new projects (no canvas state)
- Wrote 4 Playwright E2E tests with mocked SSE responses for chat init
- **Files created:** src/app/api/projects/route.ts, src/app/api/projects/[id]/route.ts, src/app/api/projects/[id]/messages/route.ts, src/app/api/projects/[id]/chat/route.ts, src/app/api/projects/[id]/chat/init/route.ts, src/lib/ai/system-prompt.ts, src/app/project/new/page.tsx, src/app/project/[id]/page.tsx, src/components/chat/ChatSidebar.tsx, e2e/new-project.test.ts
- **Files modified:** package.json (added zod, @anthropic-ai/sdk, react-markdown, uuid deps)
- **Learnings:**
  - Next.js 16 dynamic route params are Promise-based — must `await params` before accessing fields
  - Playwright `route.fulfill()` expects `string | Buffer` for body, not `Uint8Array` — use string directly for SSE mocking
  - `getByRole('alert')` in Playwright conflicts with Next.js route announcer (`__next-route-announcer__`) — use `getByText()` for specific error messages
  - When streaming SSE text accumulates and then gets added to messages array, React may briefly show duplicates — use `.first()` in Playwright assertions
  - Anthropic SDK `messages.stream()` returns an async iterable of events; check `event.type === 'content_block_delta'` and `event.delta.type === 'text_delta'` for text chunks
---

## 2026-02-26 - shastack-ar4.20
- Wrote comprehensive E2E tests for the full interview-to-canvas flow (12 new tests)
- Created reusable SSE mock helper library (`e2e/helpers/sse-mock.ts`) with builders for text, chunked, architecture, and error SSE responses
- Full flow tests: project creation → AI interview with multi-turn conversation → message ordering → persistence simulation → markdown rendering
- Error path tests: missing API key, API failures, network errors, input validation, disabled state during streaming, project not found
- **Files created:** e2e/helpers/sse-mock.ts, e2e/full-flow.test.ts, e2e/error-paths.test.ts
- **Learnings:**
  - Playwright route priority: later-registered routes have higher priority — use single `**/chat**` handler with URL branching instead of separate routes for `/chat` and `/chat/init`
  - React Strict Mode double-invokes effects in dev mode — SSE mock counters shared between init and chat handlers get incremented twice by init; track chat calls separately
  - Mocked Playwright routes bypass the server entirely, so DB persistence can't be verified — mock the messages endpoint on reload to simulate persisted data
---

## 2026-02-26 - shastack-ar4.12
- Implemented NodeDetailPanel slide-out component with full CRUD on node properties
- Created prerequisite domain types (`src/types/stack.ts`) and node config (`src/lib/node-config.ts`) since T-004 was not yet implemented
- Panel features: editable name, technology, description fields; category/subtype dropdowns with filtered subtypes; lock toggle switch; two-click delete confirmation; outside-click-to-close; animated slide-in
- Integrated panel into project page with state management for node updates and deletes (persists to API)
- Installed `lucide-react` for category icons with dynamic icon resolution
- Wrote 15 component tests covering rendering, field updates, lock toggle, delete confirmation, category changes, and rerender behavior
- Fixed test setup: added explicit `cleanup()` to `src/test/setup.ts` for proper inter-test isolation
- **Files created:** src/types/stack.ts, src/lib/node-config.ts, src/components/canvas/NodeDetailPanel.tsx, src/components/canvas/NodeDetailPanel.test.tsx
- **Files modified:** src/app/project/[id]/page.tsx, src/test/setup.ts, package.json (added lucide-react)
- **Learnings:**
  - `@testing-library/react` auto-cleanup doesn't work with vitest without `globals: true` — always add explicit cleanup
  - lucide-react exports non-component members (`createLucideIcon`, etc.) so cast through `unknown` when accessing by dynamic name
  - ESLint `react-hooks/static-components` rule prevents creating component references during render — use wrapper components for dynamic icon resolution
  - `react-hooks/set-state-in-effect` lint rule prevents direct setState in effects — use derived state (compare IDs) instead of resetting state in effects
---

## 2026-02-26 - shastack-ar4.13
- Implemented manual node addition: AddNodeDropdown component with categorized menu, ConnectionTypeSelector popover for edge creation
- AddNodeDropdown: expandable categories showing subtypes, click to add node with defaults, auto-opens detail panel for editing
- ConnectionTypeSelector: positioned popover showing all 6 connection types (HTTP, WebSocket, gRPC, TCP, Pub/Sub, File I/O) with descriptions
- Integrated both into project page: toolbar has Add Node button, node count display, simple card-based node list view (pending React Flow from T-009)
- Updated empty state message to mention manual addition option
- `hasCanvas` now checks `nodes.length > 0` instead of just `canvasState !== null` (empty architecture = no canvas)
- Extracted `saveCanvasState` helper in project page to reduce duplication
- Wrote 17 component tests (10 AddNodeDropdown + 7 ConnectionTypeSelector), all passing
- **Files created:** src/components/canvas/AddNodeDropdown.tsx, src/components/canvas/AddNodeDropdown.test.tsx, src/components/canvas/ConnectionTypeSelector.tsx, src/components/canvas/ConnectionTypeSelector.test.tsx
- **Files modified:** src/app/project/[id]/page.tsx
- **Learnings:**
  - When React Flow isn't integrated yet, a simple card-based node list view works as a functional interim for node management
  - `crypto.randomUUID()` is available in jsdom test environment without polyfill
---
