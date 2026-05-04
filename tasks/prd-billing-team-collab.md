# PRD: StackHatch Billing & Team Collaboration

## Overview
Implement a three-tier billing system (Free, Pro, Team) with Stripe Elements, usage enforcement, and full team collaboration features including shared workspaces, commenting, and a team diagram library. This transforms StackHatch from a free tool into a revenue-generating SaaS.

## Goals
- Launch three pricing tiers: Free, Pro ($19/mo), Team ($39/mo for 5 users, $79/mo for 15)
- Offer annual billing at a 21% discount ($15/mo billed annually for Pro)
- Enforce usage limits for free-tier users (projects, messages, scans)
- Enable team collaboration: shared workspaces, project commenting, team diagram library
- Provide a polished pricing page and contextual upgrade prompts at feature gates

## Quality Gates

These commands must pass for every user story:
- `pnpm typecheck` - Type checking
- `pnpm lint` - Linting

For UI stories, also include:
- Verify in browser using dev-browser skill

## Pricing Tiers Reference

| Feature | Free | Pro — $19/mo | Team — $39/mo (5 users) |
|---------|------|-------------|--------------------------|
| Projects | 2 | Unlimited | Unlimited |
| Chat messages | 20/mo | Unlimited | Unlimited |
| Repo scans | 2/mo | Unlimited | Unlimited |
| Model | Sonnet only | All models | All models |
| Export | None | PNG, SVG, JSON, MD | All + PDF |
| Custom subtypes | No | Yes | Yes |
| Versioning | No | Yes | Yes |
| Shared workspaces | — | — | Yes |
| Team diagram library | — | — | Yes |
| Commenting/review | — | — | Yes |
| SSO/SAML | — | — | Yes |
| Annual billing | — | $15/mo ($180/yr) | $33/mo ($396/yr) |

**Team tier scaling:** $39/mo (up to 5 users), $79/mo (up to 15 users), contact sales for larger.

## User Stories

### US-001: Add subscription and usage database schema
**Description:** As a developer, I want the database schema extended to support subscriptions, usage tracking, teams, and comments so that all billing and collaboration features have a data foundation.

**Acceptance Criteria:**
- [ ] Add `subscriptions` table: id, userId, stripeCustomerId, stripeSubscriptionId, plan (free/pro/team), status (active/canceled/past_due), currentPeriodEnd, createdAt, updatedAt
- [ ] Add `usage` table: id, userId, messageCount, scanCount, periodStart, periodEnd
- [ ] Add `teams` table: id, name, plan (team5/team15), ownerId, stripeSubscriptionId, createdAt
- [ ] Add `team_members` table: teamId, userId, role (owner/member), joinedAt
- [ ] Add `team_invites` table: id, teamId, email, invitedBy, token, expiresAt, status (pending/accepted/expired)
- [ ] Add `comments` table: id, projectId, userId, content, nodeId (nullable for general comments), createdAt, updatedAt
- [ ] Drizzle migration runs cleanly against existing database
- [ ] Existing users retain their data with no disruption

### US-002: Configure Stripe products and environment setup
**Description:** As a developer, I want Stripe products, prices, and environment variables configured so that the payment system has a working backend foundation.

**Acceptance Criteria:**
- [ ] Document required Stripe products: Pro Monthly, Pro Annual, Team5 Monthly, Team5 Annual, Team15 Monthly, Team15 Annual
- [ ] Add environment variables: STRIPE_SECRET_KEY, STRIPE_PUBLISHABLE_KEY, STRIPE_WEBHOOK_SECRET, NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
- [ ] Add Stripe price IDs to environment config (one per plan/interval combo)
- [ ] Add `@stripe/stripe-js` and `@stripe/react-stripe-js` as dependencies
- [ ] Add `stripe` Node.js SDK as a dependency
- [ ] Create `src/lib/stripe.ts` with initialized Stripe client and price ID mapping

### US-003: Implement Stripe Elements checkout flow
**Description:** As a user, I want to enter my payment details in an embedded Stripe Elements form so that I can subscribe to Pro or Team without leaving the app.

**Acceptance Criteria:**
- [ ] Create `POST /api/billing/create-checkout` endpoint that creates a Stripe PaymentIntent or SetupIntent
- [ ] Create `POST /api/billing/create-subscription` endpoint that creates a Stripe subscription
- [ ] Build a checkout modal/page component with Stripe Elements (CardElement or PaymentElement)
- [ ] Handle payment confirmation and redirect to success state
- [ ] Handle payment errors with user-friendly messages
- [ ] Create or retrieve Stripe customer on first checkout (link to userId)
- [ ] Store subscription details in `subscriptions` table on success

### US-004: Implement Stripe webhook handler
**Description:** As a system, I want to process Stripe webhook events so that subscription status stays in sync with Stripe.

**Acceptance Criteria:**
- [ ] Create `POST /api/webhooks/stripe` endpoint
- [ ] Verify webhook signature using STRIPE_WEBHOOK_SECRET
- [ ] Handle `customer.subscription.created` — create/update subscription record
- [ ] Handle `customer.subscription.updated` — update plan, status, currentPeriodEnd
- [ ] Handle `customer.subscription.deleted` — mark subscription canceled, revert user to free
- [ ] Handle `invoice.payment_failed` — update status to past_due
- [ ] Handle `invoice.paid` — update status to active, reset usage counters
- [ ] Update user role (free-user/paid-user) based on subscription status
- [ ] Webhook endpoint is excluded from CSRF protection and auth middleware

### US-005: Implement usage tracking and limit enforcement
**Description:** As a system, I want to track and enforce usage limits so that free-tier users are gated appropriately.

**Acceptance Criteria:**
- [ ] Create `src/lib/usage.ts` with functions: `getUsage(userId)`, `incrementMessages(userId)`, `incrementScans(userId)`, `resetUsage(userId)`
- [ ] Increment message count in `POST /api/projects/[id]/chat` before processing
- [ ] Increment scan count in `POST /api/projects/[id]/repo-scan` before processing
- [ ] Return 429 with remaining limit info when free users exceed 20 messages/mo
- [ ] Return 429 with remaining limit info when free users exceed 2 scans/mo
- [ ] Enforce 2-project limit for free users in `POST /api/projects`
- [ ] Usage resets at the start of each billing period (tracked via periodStart/periodEnd)
- [ ] Paid users (Pro/Team) bypass all usage limits
- [ ] API responses include `X-Usage-Remaining` header for metered features

### US-006: Build pricing page
**Description:** As a visitor or free user, I want to see a clear pricing page so that I can compare plans and choose the right one.

**Acceptance Criteria:**
- [ ] Create `/pricing` page with three-tier comparison layout
- [ ] Show Free, Pro ($19/mo), and Team ($39/mo) tiers side by side
- [ ] Include monthly/annual toggle — annual shows $15/mo ($180/yr) for Pro, $33/mo ($396/yr) for Team5
- [ ] Show Team tier scaling: $39/mo (5 users), $79/mo (15 users), "Contact us" for larger
- [ ] Feature comparison table matches the tier reference in this PRD
- [ ] "Get Started" button on Free tier links to sign-up
- [ ] "Upgrade" button on Pro/Team tiers initiates Stripe checkout
- [ ] Current plan is visually highlighted for logged-in users
- [ ] Page is accessible to unauthenticated visitors
- [ ] Responsive design works on mobile and desktop
- [ ] Design matches existing app theme (light/dark mode support)

### US-007: Add upgrade prompts at feature gates
**Description:** As a free user, I want to see contextual upgrade prompts when I hit a limit so that I understand what I'm missing and how to unlock it.

**Acceptance Criteria:**
- [ ] Show upgrade prompt when free user tries to create a 3rd project
- [ ] Show upgrade prompt when free user exhausts monthly chat messages (with count remaining)
- [ ] Show upgrade prompt when free user exhausts monthly repo scans
- [ ] Show upgrade prompt when free user tries to export (PNG/SVG/JSON/MD)
- [ ] Show upgrade prompt when free user tries to select an Opus model
- [ ] Show upgrade prompt when free user tries to add custom subtypes
- [ ] Each prompt includes the specific feature being gated and a link to `/pricing`
- [ ] Prompts are dismissible and non-intrusive (modal or inline banner, not blocking)
- [ ] Replace existing `toast.error` messages with styled upgrade prompts

### US-008: Add billing management to settings
**Description:** As a paying user, I want to manage my subscription from the settings page so that I can change plans, update payment, or cancel.

**Acceptance Criteria:**
- [ ] Add "Billing" section to the settings page
- [ ] Show current plan name, billing interval (monthly/annual), and next billing date
- [ ] "Change Plan" button opens plan selection (upgrade/downgrade)
- [ ] "Update Payment Method" button opens Stripe Elements form to update card
- [ ] "Cancel Subscription" button with confirmation dialog
- [ ] Cancellation takes effect at end of current billing period (not immediately)
- [ ] Show "Reactivate" button if subscription is canceled but still in paid period
- [ ] Create `POST /api/billing/manage` endpoint for plan changes
- [ ] Create `POST /api/billing/cancel` endpoint for cancellation
- [ ] Create `POST /api/billing/update-payment` endpoint for card updates
- [ ] Create Stripe billing portal session as fallback for invoice history

### US-009: Add teams database and creation flow
**Description:** As a Pro user, I want to create a team and select a team plan so that I can collaborate with colleagues.

**Acceptance Criteria:**
- [ ] Create `POST /api/teams` endpoint to create a team (name, plan selection)
- [ ] Team creation triggers Stripe checkout for the selected team plan
- [ ] Team creator is automatically added as owner in `team_members`
- [ ] Create `GET /api/teams` endpoint to list user's teams
- [ ] Create `GET /api/teams/[id]` endpoint to get team details with members
- [ ] Add team management page at `/team/[id]` showing members and settings
- [ ] Team owner can rename the team
- [ ] Only authenticated paid users can create teams

### US-010: Implement email invite system for teams
**Description:** As a team owner, I want to invite colleagues by email so that they can join my workspace.

**Acceptance Criteria:**
- [ ] Create `POST /api/teams/[id]/invites` endpoint to send invitations
- [ ] Generate unique invite token with 7-day expiration
- [ ] Send invite email with a link to `/invite/[token]` (use a simple email service or nodemailer)
- [ ] Create `/invite/[token]` page that shows team info and accept/decline buttons
- [ ] Accepting an invite adds the user to `team_members` and marks invite as accepted
- [ ] If invitee doesn't have an account, prompt them to sign up with GitHub first
- [ ] Team owner can see pending invites and revoke them
- [ ] Enforce seat limits: reject invite if team is at capacity (5 for team5, 15 for team15)
- [ ] Create `DELETE /api/teams/[id]/members/[userId]` to remove members
- [ ] Team owner cannot be removed

### US-011: Implement shared project access within teams
**Description:** As a team member, I want to access and edit projects shared within my team workspace so that we can collaborate on architecture diagrams.

**Acceptance Criteria:**
- [ ] Add `teamId` nullable column to `projects` table
- [ ] Projects with a `teamId` are visible to all team members
- [ ] Create `GET /api/teams/[id]/projects` endpoint to list team projects
- [ ] Team members can create new projects under the team
- [ ] Team members can edit any team project's canvas, name, and description
- [ ] Personal projects (no teamId) remain private to the owner
- [ ] Project list page shows both personal and team projects (with visual distinction)
- [ ] Team project changes are visible to all team members on page refresh

### US-012: Implement general project comments
**Description:** As a team member, I want to leave comments on a project so that I can discuss architecture decisions with my team.

**Acceptance Criteria:**
- [ ] Create `POST /api/projects/[id]/comments` endpoint to add a comment
- [ ] Create `GET /api/projects/[id]/comments` endpoint to list comments (with author info)
- [ ] Create `DELETE /api/projects/[id]/comments/[commentId]` endpoint (author or team owner only)
- [ ] Add a collapsible comments panel to the project page (sidebar or bottom drawer)
- [ ] Comments show author avatar, name, and timestamp
- [ ] Comments are ordered chronologically (oldest first)
- [ ] Only team members of the project's team can comment (not available for personal projects on free tier)
- [ ] New comment input with submit button at the bottom of the panel

### US-013: Implement node-anchored comments on canvas
**Description:** As a team member, I want to attach comments to specific nodes on the canvas so that I can give targeted feedback on architecture components.

**Acceptance Criteria:**
- [ ] Right-click a node shows "Add Comment" option in context menu
- [ ] Clicking "Add Comment" opens a comment input anchored to that node
- [ ] Node-anchored comments are stored with `nodeId` in the comments table
- [ ] Nodes with comments show a small comment badge/indicator (e.g., a count bubble)
- [ ] Clicking the badge opens the comments for that specific node
- [ ] Node-anchored comments appear in both the node popover and the general comments panel (with a "on [Node Name]" label)
- [ ] Deleting a node preserves its comments but marks them as orphaned (still visible in general panel)

### US-014: Implement team diagram library
**Description:** As a team member, I want a shared library of diagram templates so that our team can reuse common architecture patterns.

**Acceptance Criteria:**
- [ ] Create `diagram_templates` table: id, teamId, name, description, canvasState (JSON), createdBy, createdAt
- [ ] Create `POST /api/teams/[id]/templates` endpoint to save current project canvas as a template
- [ ] Create `GET /api/teams/[id]/templates` endpoint to list team templates
- [ ] Create `DELETE /api/teams/[id]/templates/[templateId]` endpoint (creator or team owner)
- [ ] Add "Save as Template" button to project canvas toolbar
- [ ] Add "New from Template" option when creating a new project
- [ ] Template picker shows template name, description, and a thumbnail preview
- [ ] Creating from a template copies the canvasState into the new project
- [ ] Only team members can access their team's templates

### US-015: Add annual billing toggle and plan switching
**Description:** As a user, I want to switch between monthly and annual billing so that I can save money with an annual commitment.

**Acceptance Criteria:**
- [ ] Pricing page toggle switches between monthly and annual prices
- [ ] Annual prices: Pro $15/mo ($180/yr), Team5 $33/mo ($396/yr), Team15 $66/mo ($792/yr)
- [ ] Stripe checkout creates the correct subscription based on selected interval
- [ ] Settings billing section shows current interval and option to switch
- [ ] Switching from monthly to annual prorates the charge via Stripe
- [ ] Switching from annual to monthly takes effect at end of current annual period
- [ ] Annual badge/tag shown on pricing page to highlight savings

## Functional Requirements

- FR-1: All subscription state must be driven by Stripe webhooks — the app never assumes payment succeeded without webhook confirmation
- FR-2: User role in the database must update automatically when subscription status changes (active → paid-user, canceled/expired → free-user)
- FR-3: Usage counters must reset on each billing period (monthly) as reported by Stripe invoice.paid events
- FR-4: Free users who exceed limits must receive a 429 response from APIs with a JSON body containing `{ error, limit, used, upgradeUrl }`
- FR-5: Team seat limits must be enforced at invite time — not retroactively if a team downgrades
- FR-6: Stripe webhook endpoint must validate signatures and be idempotent (processing the same event twice must be safe)
- FR-7: All Stripe API calls must use the server-side SDK only — never expose the secret key to the client
- FR-8: The pricing page must be accessible to unauthenticated users
- FR-9: Shared team projects must respect the team's subscription status — if a team subscription lapses, shared projects become read-only

## Non-Goals (Out of Scope)

- SSO/SAML integration (future enhancement, placeholder in pricing table only)
- Real-time collaborative editing (live cursors, conflict resolution) — team members edit sequentially
- Hosted AI add-on (provide Claude API calls instead of BYOK) — future phase
- PDF export for Team tier — defer to future enhancement
- Usage analytics dashboard for team owners
- Stripe Tax or multi-currency support
- Free trial period for Pro/Team (may revisit later)
- Custom branding for teams

## Technical Considerations

- **Stripe Elements** requires loading `@stripe/stripe-js` on the client and `stripe` on the server. Use `loadStripe()` with the publishable key.
- **Webhook security:** The `/api/webhooks/stripe` endpoint must skip NextAuth session checks and CSRF protection. Use raw body parsing for signature verification.
- **Email delivery:** For MVP, use a simple transactional email service (Resend, SendGrid, or nodemailer with SMTP). Keep it simple — just invite emails for now.
- **Existing role system:** The current `role` field on users (admin/free-user/paid-user) should continue to drive feature gating. Subscription webhooks update this field.
- **Database:** All new tables use the existing SQLite + Drizzle ORM setup. Consider whether SQLite handles concurrent writes for team features acceptably.
- **Canvas state for templates:** Reuse the existing `canvasState` JSON structure from the `projects` table.

## Success Metrics

- Stripe checkout completes successfully for all plan types
- Free-to-Pro conversion rate measurable via Stripe dashboard
- Usage limits enforced — no free user can exceed tier limits
- Team creation and invite flow completes end-to-end
- Comments appear correctly for both general and node-anchored types
- Annual billing discount is correctly applied and reflected in Stripe

## Open Questions

1. What transactional email provider should be used for team invites? (Resend, SendGrid, nodemailer?)
2. Should team projects support transferring ownership between teams or back to personal?
3. Is SQLite sufficient for concurrent team edits, or should we plan a PostgreSQL migration?
4. Should the "Contact sales" for 15+ users be a form or just an email link?
