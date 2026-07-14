# PRD: GitHub OAuth Authentication

## Overview

Add GitHub OAuth authentication to StackHatch using NextAuth.js. All routes become protected — users must log in to access the app. Projects are scoped to the authenticated user. This is the foundation for multi-user and team collaboration.

## Goals

- Require GitHub OAuth login to access the app
- Scope projects to the authenticated user (multi-tenancy)
- Protect all API routes with session-based auth
- Display user identity (GitHub avatar) in the toolbar
- Maintain the existing self-hosted SQLite architecture

## Quality Gates

These commands must pass for every user story:

- `npx tsc --noEmit` — Type checking
- `npx vitest run` — Test suite

## User Stories

### US-001: Install and configure NextAuth.js with GitHub provider

**Description:** As a developer, I want NextAuth.js configured with the GitHub OAuth provider so that users can authenticate via GitHub.

**Acceptance Criteria:**

- [ ] `next-auth` package installed
- [ ] NextAuth route handler at `src/app/api/auth/[...nextauth]/route.ts`
- [ ] GitHub provider configured reading `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` from env
- [ ] `NEXTAUTH_SECRET` env variable used for session encryption
- [ ] `.env.local.example` updated with all required auth env vars
- [ ] Session strategy is `jwt` (no additional session DB table needed)

### US-002: Add users table and persist GitHub identity on login

**Description:** As the system, I want to store user records in the database so that projects can be associated with a user.

**Acceptance Criteria:**

- [ ] `users` table added to Drizzle schema: `id` (TEXT, PK), `githubId` (TEXT, unique), `email` (TEXT), `name` (TEXT), `avatarUrl` (TEXT), `createdAt` (INTEGER)
- [ ] Migration created and applied via `runMigrations`
- [ ] NextAuth `signIn` callback upserts user record (create on first login, update name/avatar on subsequent logins)
- [ ] NextAuth `session` callback includes `userId` in the session object

### US-003: Add userId to projects table and scope queries

**Description:** As a user, I want my projects to be private to my account so that other users cannot see or modify them.

**Acceptance Criteria:**

- [ ] `userId` column (TEXT, nullable initially for migration) added to `projects` table
- [ ] `GET /api/projects` filters by authenticated user's ID
- [ ] `POST /api/projects` sets `userId` to authenticated user's ID
- [ ] `GET/PATCH/DELETE /api/projects/[id]` verifies the project belongs to the authenticated user (returns 404 if not)
- [ ] Chat, messages, alternatives, and repo-scan routes also verify project ownership

### US-004: Create middleware to protect all routes

**Description:** As the system, I want all pages and API routes protected so that unauthenticated users cannot access any functionality.

**Acceptance Criteria:**

- [ ] `src/middleware.ts` created using NextAuth middleware
- [ ] All routes except `/login`, `/api/auth/*`, and static assets require authentication
- [ ] Unauthenticated requests to pages redirect to `/login`
- [ ] Unauthenticated requests to API routes return 401 JSON response
- [ ] Settings API (`/api/settings`) is protected

### US-005: Create login page

**Description:** As an unauthenticated user, I want a clean login page with a "Sign in with GitHub" button so that I can access the app.

**Acceptance Criteria:**

- [ ] `/login` page created at `src/app/login/page.tsx`
- [ ] Page shows app name/logo and a "Sign in with GitHub" button
- [ ] Button triggers NextAuth GitHub sign-in flow
- [ ] After successful auth, user is redirected to `/` (dashboard)
- [ ] Page respects existing light/dark theme
- [ ] Already-authenticated users visiting `/login` are redirected to `/`

### US-006: Add user avatar and logout dropdown to toolbar

**Description:** As an authenticated user, I want to see my GitHub avatar in the toolbar with a dropdown to log out.

**Acceptance Criteria:**

- [ ] GitHub avatar (rounded) displayed in the top-right area of the project page toolbar and dashboard header
- [ ] Clicking avatar shows a dropdown with user name/email and a "Sign out" button
- [ ] "Sign out" calls NextAuth `signOut()` and redirects to `/login`
- [ ] Dropdown closes on outside click
- [ ] Falls back to initials or default icon if avatar URL fails

### US-007: Wrap app with NextAuth SessionProvider

**Description:** As a developer, I want the NextAuth session available client-side so that components can access user identity.

**Acceptance Criteria:**

- [ ] `SessionProvider` wraps the app in `src/app/layout.tsx` (or a providers component)
- [ ] `useSession()` hook returns the authenticated user in client components
- [ ] Session includes `userId`, `name`, `email`, `image` fields

## Functional Requirements

- FR-1: The system must authenticate users via GitHub OAuth 2.0 using NextAuth.js
- FR-2: On first login, the system must create a user record in the `users` table
- FR-3: On subsequent logins, the system must update the user's name and avatar from GitHub
- FR-4: All project CRUD operations must be scoped to the authenticated user's ID
- FR-5: Unauthenticated access to any page (except `/login`) must redirect to `/login`
- FR-6: Unauthenticated access to any API route (except `/api/auth/*`) must return 401
- FR-7: The session must include the internal `userId` (not just GitHub ID) for database queries
- FR-8: Existing projects with no `userId` remain in the database but are inaccessible (clean break)

## Non-Goals

- Anonymous or browser-local project access
- Email/password authentication
- Magic link authentication
- Role-based access control (admin vs user)
- Project sharing between users
- OAuth with providers other than GitHub

## Technical Considerations

- **Database:** SQLite with Drizzle ORM — add `users` table, add `userId` column to `projects`
- **Session:** JWT strategy (avoids needing a sessions table in SQLite)
- **NextAuth v5:** Use the latest stable NextAuth compatible with Next.js 16
- **Env vars needed:** `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`
- **GitHub OAuth App:** Must be registered at github.com/settings/developers with callback URL pointing to `/api/auth/callback/github`
- **Existing settings:** The per-user API key in `settings` table may need a `userId` column in a future PRD — for now settings remain global

## Success Metrics

- All pages redirect to login when unauthenticated
- Authenticated users see only their own projects
- GitHub avatar displays in toolbar with working logout
- Existing test suite passes with auth mocked in tests
- TypeScript compiles cleanly

## Open Questions

- Should the `settings` table be user-scoped now (each user has their own API key) or remain global? Recommend deferring to a follow-up PRD to keep this one focused.
