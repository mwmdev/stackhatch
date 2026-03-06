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
- **Stripe API `2026-02-25.clover`**: `current_period_end` is on `SubscriptionItem` (not `Subscription`); invoice subscription ref is at `invoice.parent.subscription_details.subscription` (not `invoice.subscription`).

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

## 2026-03-06 - stackhatch-6ms.6
- US-006 pricing page was already 10/11 complete from previous iteration
- Added current plan highlighting for logged-in users (the missing criterion)
  - Fetches `/api/billing/subscription` on mount, silently fails for unauthenticated users
  - Current plan card gets green border + ring + "Current Plan" badge
  - CTA button replaced with non-clickable "Current Plan" label
  - Handles all plan variants: free, pro, team/team5/team15
- **Files changed:** `src/app/pricing/page.tsx` (added useEffect subscription fetch, isCurrentPlan helper, conditional card styling and CTA)
- **Learnings:**
  - The subscription API returns 401 for unauthenticated users, so the fetch `.catch(() => {})` pattern keeps the page working for visitors
  - Team plans can be stored as "team", "team5", or "team15" in the DB — isCurrentPlan checks all variants
---

## 2026-03-06 - stackhatch-6ms.7
- Implemented US-007: Add upgrade prompts at all feature gates
- Created reusable `UpgradePrompt` component with inline (banner) and modal variants, amber-themed, with link to `/pricing`
- Added project count enforcement: `POST /api/projects` now checks free users against 2-project limit, returns 403 with `upgradeRequired: true`
- Replaced 3 plain-text upgrade messages in ChatSidebar (chat init, repo scan, send message) with inline UpgradePrompt banners
- Replaced 2 toast-based upgrade messages on project page (PRD export, alternatives) with UpgradePrompt modal
- Updated ExportDropdown with `onUpgradeRequired` callback to show upgrade modal instead of toast for free users
- Gated model selection in settings: free users see Sonnet-only (disabled select) with inline upgrade prompt
- Gated custom subtypes section in settings: free users see inline upgrade prompt instead of the add-subtype forms
- Dashboard shows upgrade modal when free user tries to create 3rd project
- **Files changed:**
  - `src/components/UpgradePrompt.tsx` (new — reusable component)
  - `src/components/chat/ChatSidebar.tsx` (upgrade prompt state + inline banner)
  - `src/components/canvas/ExportDropdown.tsx` (onUpgradeRequired prop)
  - `src/app/project/[id]/page.tsx` (upgrade modal for export/alternatives)
  - `src/app/page.tsx` (upgrade modal for project limit)
  - `src/app/settings/page.tsx` (model + subtypes gating)
  - `src/app/api/projects/route.ts` (project count enforcement)
- **Learnings:**
  - Drizzle's `count()` function from `drizzle-orm` works with `.all()` returning `[{ total }]` for SQLite
  - React Compiler's `preserve-manual-memoization` lint rule requires all deps used in `useCallback` to be in the dependency array — adding `onUpgradeRequired` fixed the lint error
  - The `viewAsRole` state in settings already tracks the current role via cookie, making it easy to gate UI sections without additional API calls
  - Using two variants (inline/modal) for UpgradePrompt covers both in-context hints (chat sidebar, settings) and blocking prompts (project creation, export)
---

## 2026-03-06 - stackhatch-6ms.9
- Implemented US-009: Add teams database and creation flow
- Created `POST /api/teams` — validates paid user, creates Stripe checkout session for team plan (team5/team15), returns checkout URL
- Created `GET /api/teams` — lists all teams where user is a member via inner join on teamMembers
- Added `PATCH /api/teams/[id]` — owner-only team rename with Zod validation
- Added inline rename UI to team management page: "Rename" button → inline form with save/cancel, Escape key support
- Team creation triggers Stripe checkout; actual team record is created in `create-subscription` after payment succeeds
- Only authenticated paid users can create teams (free-user role gets 403)
- GET /api/teams/[id] and team management page already existed from US-010
- **Files changed:**
  - `src/app/api/teams/route.ts` (new — POST + GET)
  - `src/app/api/teams/[id]/route.ts` (added PATCH handler)
  - `src/app/team/[id]/page.tsx` (added rename UI)
- **Learnings:**
  - Team creation is a two-step flow: POST /api/teams creates Stripe checkout session, then create-subscription creates the actual team record after payment confirmation
  - The create-checkout and create-subscription routes already handle teamName in metadata, so POST /api/teams reuses the same Stripe checkout pattern
  - Dynamic imports (`await import("@/db/schema")`) work in route handlers for accessing schema tables not in the top-level import
---

## 2026-03-06 - stackhatch-6ms.8
- Implemented US-008: Add billing management to settings
- Created `POST /api/billing/cancel` — cancel subscription at period end or reactivate a canceled subscription
- Created `POST /api/billing/update-payment` — creates Stripe SetupIntent for card updates (redirects to portal)
- Created `POST /api/billing/portal` — creates Stripe billing portal session for invoice history
- Extended `POST /api/billing/manage` with `change_plan` action using Zod discriminatedUnion for plan upgrades/downgrades with proration
- Enhanced settings billing section with:
  - "Change Plan" button with modal showing Pro/Team5/Team15 selection, current plan highlighted
  - "Update Payment Method" button opening Stripe billing portal
  - "Cancel Subscription" button with confirmation dialog showing period end date
  - "Reactivate Subscription" button when status is canceled
  - "Invoice History" button opening Stripe billing portal in new tab
  - Status badge shows "Cancels at period end" for canceled subscriptions
- **Files changed:**
  - `src/app/api/billing/cancel/route.ts` (new)
  - `src/app/api/billing/update-payment/route.ts` (new)
  - `src/app/api/billing/portal/route.ts` (new)
  - `src/app/api/billing/manage/route.ts` (extended with change_plan action)
  - `src/app/settings/page.tsx` (billing management UI)
- **Learnings:**
  - Zod's `discriminatedUnion` cleanly handles multiple action types in a single endpoint — each branch gets type-safe access to its specific fields
  - Stripe's `cancel_at_period_end: true/false` is the right way to handle cancel/reactivate — keeps subscription active until period end
  - Stripe billing portal covers both payment method updates and invoice history — avoids building custom Stripe Elements forms for card updates
---

## 2026-03-06 - stackhatch-6ms.4
- Implemented US-004: Stripe webhook handler
- Created `POST /api/webhooks/stripe` endpoint with signature verification using `STRIPE_WEBHOOK_SECRET`
- Handles `customer.subscription.created` and `customer.subscription.updated` — upserts subscription record, derives plan/interval from price ID with metadata fallback
- Handles `customer.subscription.deleted` — marks subscription canceled, reverts user role to free-user
- Handles `invoice.payment_failed` — updates subscription status to past_due
- Handles `invoice.paid` — updates subscription status to active, updates user role to paid-user, resets usage counters
- Webhook endpoint has no auth middleware (uses Stripe signature verification instead)
- **Files changed:**
  - `src/app/api/webhooks/stripe/route.ts` (new)
- **Learnings:**
  - Stripe API `2026-02-25.clover` moved `current_period_end` from `Subscription` to `SubscriptionItem` — access via `sub.items.data[0].current_period_end`
  - Stripe API `2026-02-25.clover` moved invoice subscription reference to `invoice.parent.subscription_details.subscription` (was `invoice.subscription`)
  - Next.js App Router provides raw body via `request.text()` which works directly with `stripe.webhooks.constructEvent()` — no special body parsing config needed
---

