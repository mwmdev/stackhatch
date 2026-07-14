PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_user_settings` (
	`user_id` text PRIMARY KEY NOT NULL,
	`anthropic_api_key` text,
	`model` text DEFAULT 'claude-sonnet-5' NOT NULL,
	`theme` text DEFAULT 'system' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_user_settings`("user_id", "anthropic_api_key", "model", "theme", "created_at", "updated_at") SELECT "user_id", "anthropic_api_key", CASE WHEN "model" IN ('claude-sonnet-4-20250514', 'claude-opus-4-20250514', 'claude-opus-4-1-20250805') THEN 'claude-sonnet-5' ELSE "model" END, "theme", "created_at", "updated_at" FROM `user_settings`;--> statement-breakpoint
DROP TABLE `user_settings`;--> statement-breakpoint
ALTER TABLE `__new_user_settings` RENAME TO `user_settings`;--> statement-breakpoint
PRAGMA foreign_keys=ON;
