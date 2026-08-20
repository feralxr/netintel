CREATE TABLE `client_daily` (
	`date` text NOT NULL,
	`client_id` text NOT NULL,
	`queries` integer DEFAULT 0 NOT NULL,
	`unique_domains` integer DEFAULT 0 NOT NULL,
	`blocked` integer DEFAULT 0 NOT NULL,
	`nxdomain` integer DEFAULT 0 NOT NULL,
	`cache_hit_rate` real,
	PRIMARY KEY(`date`, `client_id`)
);
--> statement-breakpoint
CREATE TABLE `device_ip_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`device_id` text NOT NULL,
	`ip` text NOT NULL,
	`start` text NOT NULL,
	`end` text
);
--> statement-breakpoint
CREATE TABLE `devices` (
	`device_id` text PRIMARY KEY NOT NULL,
	`mac` text,
	`hostname` text,
	`dhcp_client_id` text,
	`current_ip` text,
	`first_seen` text NOT NULL,
	`last_seen` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE `dns_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`timestamp` text NOT NULL,
	`client_id` text,
	`client_ip` text NOT NULL,
	`protocol` text NOT NULL,
	`domain` text NOT NULL,
	`registered_domain` text NOT NULL,
	`query_type` text NOT NULL,
	`response_code` text NOT NULL,
	`cached` integer DEFAULT false NOT NULL,
	`blocked` integer DEFAULT false NOT NULL,
	`recursive` integer DEFAULT false NOT NULL,
	`response_time_ms` real NOT NULL,
	`answer_ttl` integer,
	`upstream` text,
	`upstream_protocol` text,
	`server_instance` text DEFAULT 'primary' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `domain_categories` (
	`domain` text PRIMARY KEY NOT NULL,
	`category` text NOT NULL,
	`confidence` real DEFAULT 0 NOT NULL,
	`source` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `domain_daily` (
	`date` text NOT NULL,
	`domain` text NOT NULL,
	`queries` integer DEFAULT 0 NOT NULL,
	`unique_clients` integer DEFAULT 0 NOT NULL,
	`cache_hits` integer DEFAULT 0 NOT NULL,
	`blocked` integer DEFAULT 0 NOT NULL,
	`nxdomain` integer DEFAULT 0 NOT NULL,
	`avg_latency_ms` real,
	`p95_latency_ms` real,
	PRIMARY KEY(`date`, `domain`)
);
--> statement-breakpoint
CREATE TABLE `domain_relationships` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`domain_a` text NOT NULL,
	`domain_b` text NOT NULL,
	`cooccurrence` integer DEFAULT 0 NOT NULL,
	`conditional_probability` real
);
--> statement-breakpoint
CREATE TABLE `domains` (
	`domain` text PRIMARY KEY NOT NULL,
	`first_seen` text NOT NULL,
	`last_seen` text NOT NULL,
	`query_count` integer DEFAULT 0 NOT NULL,
	`unique_days` integer DEFAULT 0 NOT NULL,
	`popularity_score` real,
	`lifecycle_state` text
);
--> statement-breakpoint
CREATE TABLE `insights` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`timestamp` text NOT NULL,
	`type` text NOT NULL,
	`score` real,
	`explanation` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`category` text NOT NULL,
	`severity` text NOT NULL,
	`timestamp` text NOT NULL,
	`title` text NOT NULL,
	`explanation` text NOT NULL,
	`metric_id` text,
	`link` text,
	`read` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE INDEX `device_ip_history_device_idx` ON `device_ip_history` (`device_id`);--> statement-breakpoint
CREATE INDEX `dns_events_ts_idx` ON `dns_events` (`timestamp`);--> statement-breakpoint
CREATE INDEX `dns_events_domain_idx` ON `dns_events` (`domain`);--> statement-breakpoint
CREATE INDEX `dns_events_client_idx` ON `dns_events` (`client_id`);--> statement-breakpoint
CREATE INDEX `dns_events_reg_domain_idx` ON `dns_events` (`registered_domain`);--> statement-breakpoint
CREATE INDEX `domain_relationships_pair_idx` ON `domain_relationships` (`domain_a`,`domain_b`);