CREATE TABLE `saved_queries` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`definition` text NOT NULL,
	`chart_type` text DEFAULT 'table' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `dashboards` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `dashboard_panels` (
	`id` text PRIMARY KEY NOT NULL,
	`dashboard_id` text NOT NULL,
	`saved_query_id` text NOT NULL,
	`title` text NOT NULL,
	`x` integer DEFAULT 0 NOT NULL,
	`y` integer DEFAULT 0 NOT NULL,
	`w` integer DEFAULT 4 NOT NULL,
	`h` integer DEFAULT 3 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `alert_policies` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`definition` text NOT NULL,
	`severity` text DEFAULT 'warning' NOT NULL,
	`channels` text DEFAULT '[]' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`last_evaluated_at` text,
	`last_triggered_at` text
);
--> statement-breakpoint
CREATE TABLE `alert_events` (
	`id` text PRIMARY KEY NOT NULL,
	`policy_id` text NOT NULL,
	`timestamp` text NOT NULL,
	`triggered_value` real,
	`explanation` text NOT NULL,
	`acknowledged` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE `synthetic_tests` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`target_domain` text NOT NULL,
	`resolver` text NOT NULL,
	`interval_seconds` integer DEFAULT 60 NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `synthetic_results` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`test_id` text NOT NULL,
	`timestamp` text NOT NULL,
	`success` integer NOT NULL,
	`response_time_ms` real,
	`resolved_ip` text,
	`error_message` text
);
--> statement-breakpoint
CREATE INDEX `synthetic_results_test_idx` ON `synthetic_results` (`test_id`,`timestamp`);
