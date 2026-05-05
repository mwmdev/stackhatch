PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_users` (
	`id` text PRIMARY KEY NOT NULL,
	`github_id` text NOT NULL UNIQUE,
	`email` text,
	`name` text,
	`avatar_url` text,
	`role` text DEFAULT 'free' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_users`("id", "github_id", "email", "name", "avatar_url", "role", "created_at")
SELECT
	"id",
	"github_id",
	"email",
	"name",
	"avatar_url",
	CASE
		WHEN "role" = 'free-user' THEN 'free'
		WHEN "role" = 'paid-user' THEN 'pro'
		WHEN "role" = 'team' THEN 'pro'
		ELSE "role"
	END,
	"created_at"
FROM `users`;--> statement-breakpoint
DROP TABLE `users`;--> statement-breakpoint
ALTER TABLE `__new_users` RENAME TO `users`;--> statement-breakpoint
PRAGMA foreign_keys=ON;
