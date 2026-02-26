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
