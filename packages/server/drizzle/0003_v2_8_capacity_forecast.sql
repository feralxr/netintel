CREATE TABLE `system_metrics_daily` (
	`date` text PRIMARY KEY NOT NULL,
	`db_size_bytes` integer NOT NULL,
	`device_count` integer NOT NULL,
	`total_queries` integer NOT NULL,
	`available_disk_bytes` integer
);
