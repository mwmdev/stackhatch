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

