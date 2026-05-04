import { integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export type UserRole = "admin" | "free-user" | "paid-user";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  githubId: text("github_id").notNull().unique(),
  email: text("email"),
  name: text("name"),
  avatarUrl: text("avatar_url"),
  role: text("role", { enum: ["admin", "free-user", "paid-user"] })
    .notNull()
    .default("free-user"),
  createdAt: integer("created_at", { mode: "number" }).notNull(),
});

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  repoUrl: text("repo_url"),
  canvasState: text("canvas_state"),
  userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
  teamId: text("team_id").references(() => teams.id, { onDelete: "set null" }),
  createdAt: integer("created_at", { mode: "number" }).notNull(),
  updatedAt: integer("updated_at", { mode: "number" }).notNull(),
});

export const messages = sqliteTable("messages", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  role: text("role", { enum: ["user", "assistant"] }).notNull(),
  content: text("content").notNull(),
  createdAt: integer("created_at", { mode: "number" }).notNull(),
});

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

// Billing and subscription tables
export const subscriptions = sqliteTable("subscriptions", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  plan: text("plan", { enum: ["free", "pro", "team"] })
    .notNull()
    .default("free"),
  billingInterval: text("billing_interval", { enum: ["monthly", "annual"] }).default("monthly"),
  status: text("status", { enum: ["active", "canceled", "past_due"] }).notNull(),
  currentPeriodEnd: integer("current_period_end", { mode: "number" }),
  createdAt: integer("created_at", { mode: "number" }).notNull(),
  updatedAt: integer("updated_at", { mode: "number" }).notNull(),
});

export const usage = sqliteTable("usage", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  messageCount: integer("message_count").notNull().default(0),
  scanCount: integer("scan_count").notNull().default(0),
  periodStart: integer("period_start", { mode: "number" }).notNull(),
  periodEnd: integer("period_end", { mode: "number" }).notNull(),
});

// Team collaboration tables
export const teams = sqliteTable("teams", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  plan: text("plan", { enum: ["team5", "team15"] }).notNull(),
  ownerId: text("owner_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  stripeSubscriptionId: text("stripe_subscription_id"),
  createdAt: integer("created_at", { mode: "number" }).notNull(),
});

export const teamMembers = sqliteTable(
  "team_members",
  {
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["owner", "member"] }).notNull(),
    joinedAt: integer("joined_at", { mode: "number" }).notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.teamId, table.userId],
    }),
  ]
);

export const teamInvites = sqliteTable("team_invites", {
  id: text("id").primaryKey(),
  teamId: text("team_id")
    .notNull()
    .references(() => teams.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  invitedBy: text("invited_by")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: integer("expires_at", { mode: "number" }).notNull(),
  status: text("status", { enum: ["pending", "accepted", "expired"] })
    .notNull()
    .default("pending"),
});

export const comments = sqliteTable("comments", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  nodeId: text("node_id"), // nullable for general comments
  createdAt: integer("created_at", { mode: "number" }).notNull(),
  updatedAt: integer("updated_at", { mode: "number" }).notNull(),
});

export const diagramTemplates = sqliteTable("diagram_templates", {
  id: text("id").primaryKey(),
  teamId: text("team_id")
    .notNull()
    .references(() => teams.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  canvasState: text("canvas_state").notNull(), // JSON
  createdBy: text("created_by")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: integer("created_at", { mode: "number" }).notNull(),
});
