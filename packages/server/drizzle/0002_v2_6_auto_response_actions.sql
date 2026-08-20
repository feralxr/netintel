ALTER TABLE `devices` ADD `flagged` integer DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE `devices` ADD `flag_reason` text;
--> statement-breakpoint
ALTER TABLE `alert_policies` ADD `action` text DEFAULT '{"type":"none"}' NOT NULL;
