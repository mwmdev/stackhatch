PRAGMA foreign_keys=OFF;--> statement-breakpoint
DELETE FROM `settings` WHERE `key` = 'apiKey';--> statement-breakpoint
CREATE TABLE `__new_projects` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`repo_url` text,
	`canvas_state` text,
	`user_id` text,
	`team_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE set null
);--> statement-breakpoint
INSERT INTO `__new_projects` (
	`id`,
	`name`,
	`description`,
	`repo_url`,
	`canvas_state`,
	`user_id`,
	`team_id`,
	`created_at`,
	`updated_at`
)
SELECT
	`id`,
	`name`,
	`description`,
	`repo_url`,
	`canvas_state`,
	`user_id`,
	CASE
		WHEN `team_id` IS NOT NULL
			AND EXISTS (SELECT 1 FROM `teams` WHERE `teams`.`id` = `projects`.`team_id`)
		THEN `team_id`
		ELSE NULL
	END,
	`created_at`,
	`updated_at`
FROM `projects`;--> statement-breakpoint
DROP TABLE `projects`;--> statement-breakpoint
ALTER TABLE `__new_projects` RENAME TO `projects`;--> statement-breakpoint
CREATE TABLE `__new_team_members` (
	`team_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	`joined_at` integer NOT NULL,
	PRIMARY KEY(`team_id`, `user_id`),
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
INSERT INTO `__new_team_members` (`team_id`, `user_id`, `role`, `joined_at`)
SELECT
	`team_id`,
	`user_id`,
	CASE WHEN SUM(CASE WHEN `role` = 'owner' THEN 1 ELSE 0 END) > 0 THEN 'owner' ELSE 'member' END,
	MIN(`joined_at`)
FROM `team_members`
GROUP BY `team_id`, `user_id`;--> statement-breakpoint
DROP TABLE `team_members`;--> statement-breakpoint
ALTER TABLE `__new_team_members` RENAME TO `team_members`;--> statement-breakpoint
PRAGMA foreign_keys=ON;
