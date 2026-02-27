# Ralph Progress Log

This file tracks progress across iterations. Agents update this file
after each iteration and it's included in prompts for context.

## Codebase Patterns (Study These First)

### NextAuth.js Integration Pattern
- NextAuth v5 (beta) requires `as any` casting for route handlers due to Next.js 16 compatibility issues
- JWT session strategy works well with SQLite (no session table needed)
- Type extensions go in `src/types/next-auth.d.ts` with optional fields for incomplete sessions
- Environment variables documented in `.env.local.example` with setup instructions

### Database User Persistence Pattern
- Use upsert pattern in NextAuth signIn callback: check if user exists, create if new, update if existing
- Store database userId in JWT token, then pass to session for API route access
- Use explicit type casting (String()) for GitHub profile.id to avoid TypeScript issues
- Migrations auto-run via `runMigrations()` calls in API routes - no manual migration needed

### Authentication and Authorization Pattern
- Create centralized auth helper (`src/lib/auth.ts`) with `getAuthenticatedUserId()` for consistent session handling
- Use `auth()` function from centralized auth config for server-side session access
- Add `userId` column to data tables with foreign key constraints to users table
- Use `and(eq(table.id, id), eq(table.userId, userId))` pattern for ownership verification
- All API routes check authentication first, return 401 if unauthenticated, 404 if resource not owned by user

---

## 2026-02-27 - shastack-uh7.1
- Implemented NextAuth.js configuration with GitHub OAuth provider
- Files changed:
  - `/home/mike/cloud/apps/mwm/shastack/package.json` - Added next-auth@5.0.0-beta.30
  - `/home/mike/cloud/apps/mwm/shastack/src/app/api/auth/[...nextauth]/route.ts` - NextAuth route handler
  - `/home/mike/cloud/apps/mwm/shastack/src/types/next-auth.d.ts` - TypeScript extensions for session
  - `/home/mike/cloud/apps/mwm/shastack/.env.local.example` - Environment variables example
- **Learnings:**
  - NextAuth v5 beta has compatibility issues with Next.js 16 requiring `as any` casting for route handlers
  - GitHub profile.id comes as unknown type requiring String() casting
  - JWT strategy works seamlessly with existing SQLite + Drizzle setup
  - Session callback needs to handle undefined tokens gracefully
---

## 2026-02-27 - shastack-uh7.2
- Implemented users table and GitHub identity persistence in database
- Files changed:
  - `/home/mike/cloud/apps/mwm/shastack/src/db/schema.ts` - Added users table with id, githubId (unique), email, name, avatarUrl, createdAt
  - `/home/mike/cloud/apps/mwm/shastack/drizzle/0002_strong_gressill.sql` - Generated migration for users table
  - `/home/mike/cloud/apps/mwm/shastack/src/app/api/auth/[...nextauth]/route.ts` - Added signIn callback for user persistence and session callback for userId
  - `/home/mike/cloud/apps/mwm/shastack/src/types/next-auth.d.ts` - Added userId to session types
- **Learnings:**
  - Drizzle auto-generates migrations with `npm run db:generate` and they auto-apply via `runMigrations()` in API routes
  - NextAuth signIn callback perfect place for upsert logic - create on first login, update name/avatar on subsequent
  - JWT callback must fetch userId from DB after user creation to include in session
  - Type safety requires explicit casting (String()) for GitHub profile data to avoid TypeScript eq() errors
---

## 2026-02-27 - shastack-uh7.3
- Implemented user project scoping and ownership verification across all routes
- Files changed:
  - `/home/mike/cloud/apps/mwm/shastack/src/db/schema.ts` - Added userId column to projects table with foreign key to users
  - `/home/mike/cloud/apps/mwm/shastack/drizzle/0003_easy_sway.sql` - Generated migration for userId column addition
  - `/home/mike/cloud/apps/mwm/shastack/src/lib/auth-config.ts` - Extracted NextAuth config for reusable auth function
  - `/home/mike/cloud/apps/mwm/shastack/src/lib/auth.ts` - Centralized authentication helpers for session management
  - `/home/mike/cloud/apps/mwm/shastack/src/app/api/projects/route.ts` - Updated GET/POST routes for user scoping
  - `/home/mike/cloud/apps/mwm/shastack/src/app/api/projects/[id]/route.ts` - Updated GET/PATCH/DELETE for ownership verification
  - `/home/mike/cloud/apps/mwm/shastack/src/app/api/projects/[id]/chat/route.ts` - Added ownership verification
  - `/home/mike/cloud/apps/mwm/shastack/src/app/api/projects/[id]/chat/init/route.ts` - Added ownership verification
  - `/home/mike/cloud/apps/mwm/shastack/src/app/api/projects/[id]/messages/route.ts` - Added ownership verification
  - `/home/mike/cloud/apps/mwm/shastack/src/app/api/projects/[id]/alternatives/route.ts` - Added ownership verification
  - `/home/mike/cloud/apps/mwm/shastack/src/app/api/projects/[id]/repo-scan/route.ts` - Added ownership verification
  - Updated test database schemas in `src/db/db.test.ts` and `src/lib/ai/stream-chat.test.ts`
- **Learnings:**
  - Centralized auth config pattern enables both route handlers and session access from single source
  - NextAuth v5 requires `auth()` function import from centralized config, not `getServerSession`
  - Ownership verification pattern: check authentication first, then verify resource belongs to user
  - Database migrations automatically apply in development via runMigrations() calls in routes
  - Test database schemas must be manually updated to match production schema changes
  - Foreign key constraints ensure data integrity between users and their projects
---

