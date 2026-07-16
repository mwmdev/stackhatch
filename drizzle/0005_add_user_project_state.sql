CREATE TABLE `user_project_state` (
	`user_id` text PRIMARY KEY NOT NULL,
	`last_opened_project_id` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`,`last_opened_project_id`) REFERENCES `projects`(`user_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `projects_user_id_id_unique` ON `projects` (`user_id`,`id`);