ALTER TABLE `projects` ADD `repo_commit_sha` text;--> statement-breakpoint
ALTER TABLE `projects` ADD `repo_scanned_at` integer;--> statement-breakpoint
ALTER TABLE `projects` ADD `repo_analysis_status` text;--> statement-breakpoint
ALTER TABLE `projects` ADD `repo_analysis_warning` text;