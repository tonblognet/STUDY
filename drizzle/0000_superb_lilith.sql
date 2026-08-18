CREATE TABLE `comparison_items` (
	`user_id` text NOT NULL,
	`program_id` text NOT NULL,
	`position` integer NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`user_id`, `program_id`),
	FOREIGN KEY (`user_id`) REFERENCES `site_users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_comparison_items_user_position` ON `comparison_items` (`user_id`,`position`);--> statement-breakpoint
CREATE TABLE `score_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`scores_json` text NOT NULL,
	`individual_achievements` integer DEFAULT 0 NOT NULL,
	`dvi_score` integer,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `site_users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_score_profiles_user_updated` ON `score_profiles` (`user_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `site_users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`full_name` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`last_seen_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_site_users_email` ON `site_users` (`email`);--> statement-breakpoint
CREATE TABLE `user_audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`summary_json` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `site_users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_user_audit_log_user_created` ON `user_audit_log` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `user_favorites` (
	`user_id` text NOT NULL,
	`program_id` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`user_id`, `program_id`),
	FOREIGN KEY (`user_id`) REFERENCES `site_users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_user_favorites_user_created` ON `user_favorites` (`user_id`,`created_at`);