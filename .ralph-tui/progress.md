# Ralph Progress Log

This file tracks progress across iterations. Agents update this file
after each iteration and it's included in prompts for context.

## Codebase Patterns (Study These First)

- **API route auth pattern**: Use `getAuthenticatedUserId()` from `@/lib/auth`, return 401 if null.
- **Team membership check**: Query `teamMembers` table with `and(eq(teamMembers.teamId, id), eq(teamMembers.userId, userId))` using `.get()`.
- **DB access**: Call `getDb()` + `runMigrations(db)` at start of each API handler. Uses better-sqlite3 (synchronous).
- **Schema IDs**: All primary keys are `text` UUIDs generated with `uuid()`.
- **Canvas state**: Stored as JSON string in `canvasState` column. Includes `nodes`, `edges`, `positions`, and `alternatives`.
- **Modal pattern**: Use `fixed inset-0 z-50` overlay with `bg-black bg-opacity-50` and centered `bg-[var(--card)]` card.
- **Pre-existing lint warnings**: `admin/page.tsx` (img element), `settings/page.tsx` (unused eslint-disable) — not related to billing/team features.

---

## 2026-03-06 - stackhatch-6ms.14
- US-014 was already fully implemented from a previous iteration
- Verified all 9 acceptance criteria: schema, 3 API endpoints, save-as-template button, new-from-template flow, template picker with thumbnails, canvas state copying, team access control
- Fixed pre-existing lint error in `DevRoleSwitcher.tsx` (setState in useEffect → useSyncExternalStore)
- **Files changed:** `src/components/DevRoleSwitcher.tsx` (lint fix only)
- **Learnings:**
  - The `diagramTemplates` schema, migration (0006), API routes, TemplatePicker component, and UI integration in project page and new project page were all complete
  - `useSyncExternalStore` is the correct replacement for `useState` + `useEffect` pattern when reading external state (cookies) to avoid the react-hooks/set-state-in-effect lint rule
---

