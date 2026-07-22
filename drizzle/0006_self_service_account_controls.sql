ALTER TABLE `user_settings` ADD `custom_subtypes` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
UPDATE `user_settings`
SET `custom_subtypes` = stackhatch_validated_custom_subtypes(
	(SELECT `value` FROM `settings` WHERE `key` = 'customSubtypes')
);--> statement-breakpoint
INSERT INTO `user_settings` (
	`user_id`,
	`anthropic_api_key`,
	`model`,
	`theme`,
	`custom_subtypes`,
	`created_at`,
	`updated_at`
)
SELECT
	`users`.`id`,
	NULL,
	'claude-sonnet-5',
	'system',
	stackhatch_validated_custom_subtypes(
		(SELECT `value` FROM `settings` WHERE `key` = 'customSubtypes')
	),
	`users`.`created_at`,
	`users`.`created_at`
FROM `users`
WHERE NOT EXISTS (
	SELECT 1 FROM `user_settings` WHERE `user_settings`.`user_id` = `users`.`id`
);--> statement-breakpoint
DROP TABLE `settings`;--> statement-breakpoint
CREATE INDEX `messages_project_id_idx` ON `messages` (`project_id`);--> statement-breakpoint
CREATE INDEX `templates_user_id_idx` ON `templates` (`user_id`);--> statement-breakpoint
ALTER TABLE `users` DROP COLUMN `role`;
