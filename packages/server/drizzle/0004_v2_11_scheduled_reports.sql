CREATE TABLE `report_schedules` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`frequency` text NOT NULL,
	`hour_utc` integer DEFAULT 6 NOT NULL,
	`day_of_week_utc` integer DEFAULT 1,
	`format` text DEFAULT 'pdf' NOT NULL,
	`email_to` text,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`last_generated_at` text
);
--> statement-breakpoint
CREATE TABLE `generated_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`schedule_id` text NOT NULL,
	`generated_at` text NOT NULL,
	`format` text NOT NULL,
	`file_path` text NOT NULL,
	`file_size_bytes` integer NOT NULL
);
