import { foreignKey, integer, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";

export type UserRole = "user" | "admin";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  githubId: text("github_id").notNull().unique(),
  email: text("email"),
  name: text("name"),
  avatarUrl: text("avatar_url"),
  role: text("role", { enum: ["user", "admin"] })
    .notNull()
    .default("user"),
  createdAt: integer("created_at", { mode: "number" }).notNull(),
});

export const projects = sqliteTable(
  "projects",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    description: text("description"),
    repoUrl: text("repo_url"),
    repoCommitSha: text("repo_commit_sha"),
    repoScannedAt: integer("repo_scanned_at", { mode: "number" }),
    repoAnalysisStatus: text("repo_analysis_status", { enum: ["complete", "partial"] }),
    repoAnalysisWarning: text("repo_analysis_warning"),
    canvasState: text("canvas_state"),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: integer("created_at", { mode: "number" }).notNull(),
    updatedAt: integer("updated_at", { mode: "number" }).notNull(),
  },
  (table) => [unique("projects_user_id_id_unique").on(table.userId, table.id)]
);

export const userProjectState = sqliteTable(
  "user_project_state",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    lastOpenedProjectId: text("last_opened_project_id"),
  },
  (table) => [
    foreignKey({
      columns: [table.userId, table.lastOpenedProjectId],
      foreignColumns: [projects.userId, projects.id],
      name: "user_project_state_owned_project_fk",
    }).onDelete("cascade"),
  ]
);

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

export const userSettings = sqliteTable("user_settings", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  anthropicApiKey: text("anthropic_api_key"),
  model: text("model", {
    enum: ["claude-sonnet-5", "claude-opus-4-8", "claude-haiku-4-5-20251001"],
  })
    .notNull()
    .default("claude-sonnet-5"),
  theme: text("theme", { enum: ["light", "dark", "system"] })
    .notNull()
    .default("system"),
  createdAt: integer("created_at", { mode: "number" }).notNull(),
  updatedAt: integer("updated_at", { mode: "number" }).notNull(),
});

export const templates = sqliteTable("templates", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  canvasState: text("canvas_state").notNull(),
  createdAt: integer("created_at", { mode: "number" }).notNull(),
});
