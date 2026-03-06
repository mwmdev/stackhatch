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

## 2026-03-06 - stackhatch-6ms.15
- Implemented US-015: Annual billing toggle and plan switching
- Added `billingInterval` column to subscriptions schema + migration (0007)
- Updated `create-subscription` route to persist billing interval
- Created `GET /api/billing/subscription` endpoint for fetching billing info
- Created `POST /api/billing/manage` endpoint for switching between monthly/annual billing
  - Monthly → Annual: prorates via Stripe
  - Annual → Monthly: takes effect at end of current period
- Added Billing section to settings page showing plan, interval, status, next billing date, and switch button
- Enhanced pricing page with annual savings badge on toggle and per-card savings badges, plus annual total price display
- Updated team scaling section to show annual prices when annual toggle is active
- **Files changed:**
  - `src/db/schema.ts` (added `billingInterval` column)
  - `drizzle/0007_dapper_sue_storm.sql` (migration)
  - `src/app/api/billing/create-subscription/route.ts` (store interval)
  - `src/app/api/billing/subscription/route.ts` (new)
  - `src/app/api/billing/manage/route.ts` (new)
  - `src/app/settings/page.tsx` (billing section)
  - `src/app/pricing/page.tsx` (annual badge + annual totals)
- **Learnings:**
  - Stripe subscription interval switching uses `proration_behavior: 'create_prorations'` for upgrades (monthly→annual) and `proration_behavior: 'none'` for downgrades (annual→monthly)
  - The subscriptions table didn't have a billing interval column originally; this was needed to avoid Stripe API calls on every settings page load
  - `Promise.all` for parallel fetching of settings + billing data in the settings page useEffect
---

## 2026-03-06 - stackhatch-6ms.11
- Implemented US-011: Shared project access within teams
- Created `GET /api/teams/[id]/projects` endpoint to list team projects (membership-gated)
- Updated `POST /api/projects` to accept optional `teamId` with team membership verification
- Replaced `verifyProjectOwnership` with `verifyProjectAccess` in project `[id]` routes — checks owner OR team membership
- Team members can GET and PATCH any project belonging to their team; DELETE remains owner-only
- Updated `GET /api/projects` to return both personal projects and team projects via `or()` + `inArray()` with left join on teams for team name
- Added team name badge to project cards on dashboard (colored pill with team name)
- **Files changed:**
  - `src/app/api/teams/[id]/projects/route.ts` (new)
  - `src/app/api/projects/route.ts` (teamId support in POST, team projects in GET with team name join)
  - `src/app/api/projects/[id]/route.ts` (verifyProjectAccess replaces verifyProjectOwnership)
  - `src/app/page.tsx` (team badge on project cards)
- **Learnings:**
  - `or()` with `inArray()` is the clean way to combine "owned by user OR belongs to user's teams" in a single Drizzle query
  - Left join on teams table to get team name avoids a separate API call for team metadata on the project list
  - `verifyProjectAccess` checks project existence first, then owner, then team membership — avoids redundant queries
  - DELETE should remain owner-only even for team projects to prevent accidental deletion by team members
---

## 2026-03-06 - stackhatch-6ms.10
- Implemented US-010: Email invite system for teams
- Created `POST /api/teams/[id]/invites` — send invite with unique token, 7-day expiry, seat limit enforcement
- Created `GET /api/teams/[id]/invites` — list pending invites (owner only)
- Created `DELETE /api/teams/[id]/invites/[inviteId]` — revoke pending invite
- Created `GET /api/invites/[token]` — fetch invite details (no auth required for viewing)
- Created `POST /api/invites/[token]` — accept invite, adds user to team_members
- Created `DELETE /api/teams/[id]/members/[userId]` — remove member (owner only, owner can't be removed)
- Created `GET /api/teams/[id]` — get team details with members (any member)
- Created `/invite/[token]` page with accept/decline UI and auth check
- Created `/team/[id]` management page with members list, invite form, pending invites, remove member
- **Files changed:**
  - `src/app/api/teams/[id]/route.ts` (new)
  - `src/app/api/teams/[id]/invites/route.ts` (new)
  - `src/app/api/teams/[id]/invites/[inviteId]/route.ts` (new)
  - `src/app/api/teams/[id]/members/[userId]/route.ts` (new)
  - `src/app/api/invites/[token]/route.ts` (new)
  - `src/app/invite/[token]/page.tsx` (new)
  - `src/app/team/[id]/page.tsx` (new)
- **Learnings:**
  - Seat limits count both existing members AND pending invites to prevent over-inviting
  - Invite token API (GET) is intentionally unauthenticated so the invite page can load for non-users, while accept (POST) requires auth
  - `randomBytes(32).toString("hex")` from Node crypto generates secure invite tokens
  - Use `next/image` Image component instead of `<img>` to avoid the `@next/next/no-img-element` lint warning
---

## 2026-03-06 - stackhatch-6ms.12
- Implemented US-012: General project comments
- Created `POST /api/projects/[id]/comments` — add comment with team membership verification
- Created `GET /api/projects/[id]/comments` — list comments ordered chronologically with author info (name, avatar)
- Created `DELETE /api/projects/[id]/comments/[commentId]` — delete by comment author or team owner
- Created `CommentsPanel` component — collapsible panel anchored bottom-right of canvas area
  - Shows author avatar, name, relative timestamp
  - Inline delete on hover (group-hover pattern)
  - New comment input with submit button at bottom
  - Auto-scrolls to latest comment
- Comments only available on team projects (teamId check + team membership verification)
- **Files changed:**
  - `src/app/api/projects/[id]/comments/route.ts` (new — GET + POST)
  - `src/app/api/projects/[id]/comments/[commentId]/route.ts` (new — DELETE)
  - `src/components/comments/CommentsPanel.tsx` (new)
  - `src/app/project/[id]/page.tsx` (added CommentsPanel import and usage)
- **Learnings:**
  - `verifyCommentAccess` pattern: check project exists → check teamId is set → check team membership — reusable for any team-only feature
  - Use `Promise<{ id: string }>` for params type in Next.js 15 dynamic routes (not bare `{ id: string }`)
  - `group` + `group-hover:inline` Tailwind pattern works well for showing delete buttons only on hover
---

## 2026-03-06 - stackhatch-6ms.13
- Implemented US-013: Node-anchored comments on canvas
- Added "Add Comment" option to node right-click context menu in StackNode
- Added comment count badge (blue circle) on nodes with comments, clickable to filter
- Enhanced CommentsPanel with node filtering, "on [Node Name]" labels, and orphaned comment indicators
- Wired project page to track comment counts per node and pass them to node data
- Node deletion preserves comments — they show as "on deleted node" in the general panel
- **Files changed:**
  - `src/components/canvas/StackNode.tsx` (context menu + badge + new data props)
  - `src/components/comments/CommentsPanel.tsx` (node filtering, labels, counts reporting)
  - `src/app/project/[id]/page.tsx` (comment counts state, callbacks, nodeNames map, CommentsPanel props)
- **Learnings:**
  - Use an incrementing counter (`openTrigger`) instead of a boolean for "force open" patterns — React batches boolean toggles within the same render
  - Comment counts can be derived in CommentsPanel and reported up via callback, avoiding an extra API call
  - Orphaned comments need no DB changes — just check if nodeId exists in the current nodeNames map at render time
---

