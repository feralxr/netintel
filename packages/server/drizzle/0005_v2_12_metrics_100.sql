ALTER TABLE `dns_events` ADD `answer_data` text;
--> statement-breakpoint
CREATE TABLE `dhcp_lease_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`mac` text NOT NULL,
	`client_identifier` text,
	`ip_address` text NOT NULL,
	`host_name` text,
	`lease_obtained` text NOT NULL,
	`lease_expires` text,
	`event_type` text NOT NULL,
	`recorded_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `dhcp_lease_events_mac_idx` ON `dhcp_lease_events` (`mac`);
--> statement-breakpoint
CREATE INDEX `dhcp_lease_events_recorded_idx` ON `dhcp_lease_events` (`recorded_at`);
--> statement-breakpoint
CREATE TABLE `host_health_samples` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`timestamp` text NOT NULL,
	`cpu_load_avg_1m` real,
	`memory_used_percent` real NOT NULL,
	`disk_available_bytes` integer,
	`technitium_reachable` integer NOT NULL,
	`technitium_last_error` text
);
--> statement-breakpoint
CREATE INDEX `host_health_samples_ts_idx` ON `host_health_samples` (`timestamp`);
--> statement-breakpoint
CREATE TABLE `server_restarts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`started_at` text NOT NULL,
	`ended_at` text,
	`clean_shutdown` integer DEFAULT false NOT NULL
);
