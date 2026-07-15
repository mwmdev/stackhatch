CREATE TABLE `__new_projects` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`repo_url` text,
	`repo_commit_sha` text,
	`repo_scanned_at` integer,
	`repo_analysis_status` text,
	`repo_analysis_warning` text,
	`canvas_state` text,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_projects` (`id`, `name`, `description`, `repo_url`, `repo_commit_sha`, `repo_scanned_at`, `repo_analysis_status`, `repo_analysis_warning`, `canvas_state`, `user_id`, `created_at`, `updated_at`)
SELECT `id`, `name`, `description`, `repo_url`, `repo_commit_sha`, `repo_scanned_at`, `repo_analysis_status`, `repo_analysis_warning`, `canvas_state`, `user_id`, `created_at`, `updated_at`
FROM `projects`;--> statement-breakpoint
CREATE TABLE `__new_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `__new_projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_messages` (`id`, `project_id`, `role`, `content`, `created_at`)
SELECT `id`, `project_id`, `role`, `content`, `created_at`
FROM `messages`;--> statement-breakpoint
CREATE TABLE `notes` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`content` text NOT NULL,
	`node_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `__new_projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `notes` (`id`, `project_id`, `content`, `node_id`, `created_at`, `updated_at`)
SELECT `id`, `project_id`, `content`, `node_id`, `created_at`, `updated_at`
FROM `comments`;--> statement-breakpoint
CREATE TABLE `templates` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`canvas_state` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `templates` (`id`, `user_id`, `name`, `description`, `canvas_state`, `created_at`)
SELECT `id`, `created_by`, `name`, `description`, `canvas_state`, `created_at`
FROM `diagram_templates`;--> statement-breakpoint
DROP TABLE `comments`;--> statement-breakpoint
DROP TABLE `messages`;--> statement-breakpoint
DROP TABLE `projects`;--> statement-breakpoint
ALTER TABLE `__new_projects` RENAME TO `projects`;--> statement-breakpoint
ALTER TABLE `__new_messages` RENAME TO `messages`;--> statement-breakpoint
DROP TABLE `diagram_templates`;--> statement-breakpoint
DROP TABLE `team_invites`;--> statement-breakpoint
DROP TABLE `team_members`;--> statement-breakpoint
DROP TABLE `teams`;
