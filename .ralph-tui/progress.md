# Ralph Progress Log

This file tracks progress across iterations. Agents update this file
after each iteration and it's included in prompts for context.

## Codebase Patterns (Study These First)

- **Next.js 16**: `next lint` CLI subcommand removed. Use `eslint .` directly.
- **eslint-config-next v16**: Exports flat config array natively. No need for `@eslint/eslintrc` FlatCompat wrapper.
- **Docker standalone**: `next.config.ts` must have `output: "standalone"` for the production Dockerfile multi-stage build pattern.
- **Tailwind v4**: Uses `@import "tailwindcss"` in CSS instead of `@tailwind` directives. Config via `@tailwindcss/postcss` plugin in `postcss.config.mjs`.

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
