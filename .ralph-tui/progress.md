# Ralph Progress Log

This file tracks progress across iterations. Agents update this file
after each iteration and it's included in prompts for context.

## Codebase Patterns (Study These First)

### Database Schema & Migrations
- **Drizzle ORM**: Used for all database operations with SQLite as the database
- **Migration Pattern**: Schema changes go in `src/db/schema.ts`, generate migrations with `npx drizzle-kit generate`
- **Foreign Keys**: Always use cascading deletes (`{ onDelete: "cascade" }`) for dependent data
- **Timestamps**: Use `integer("field_name", { mode: "number" })` for Unix timestamps (Date.now())
- **Text Enums**: Use `text("field", { enum: ["val1", "val2"] })` for string enums with TypeScript types

---

## [2026-03-06] - stackhatch-6ms.1
- ✅ Added 6 new database tables for billing and team collaboration features
- ✅ Extended projects table with teamId field for shared team projects
- ✅ Generated migration `0005_gorgeous_golden_guardian.sql` successfully
- **Files changed:**
  - `src/db/schema.ts` - Added subscriptions, usage, teams, team_members, team_invites, comments tables
  - `drizzle/0005_gorgeous_golden_guardian.sql` - Generated migration file
- **Learnings:**
  - SQLite + Drizzle ORM handles complex foreign key relationships well
  - Migration generation is seamless with `npx drizzle-kit generate`
  - Existing lint errors in DevRoleSwitcher.tsx don't affect schema changes
  - TypeScript compilation confirms schema syntax is correct
---

## [2026-03-06] - stackhatch-6ms.2
- ✅ Configured Stripe environment variables and price IDs (already in .env.example)
- ✅ Verified Stripe dependencies already installed (stripe, @stripe/stripe-js, @stripe/react-stripe-js)
- ✅ Created comprehensive stripe.ts library with client initialization and price mapping
- ✅ Documented required Stripe products and setup instructions
- **Files changed:**
  - `src/lib/stripe.ts` - New file with Stripe client, price mapping, plan config, and helper functions
  - `docs/stripe-setup.md` - New documentation for Stripe dashboard setup
- **Learnings:**
  - Stripe API version must match TypeScript definitions (used '2026-02-25.clover')
  - Environment setup was already comprehensive in .env.example
  - Plan configuration structure supports both individual and team pricing
  - Helper functions make price ID lookups cleaner for future API implementations
---

