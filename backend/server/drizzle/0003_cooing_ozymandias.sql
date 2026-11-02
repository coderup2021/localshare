CREATE TABLE `attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`uploader_type` text NOT NULL,
	`uploader_id` text NOT NULL,
	`storage_key` text NOT NULL,
	`original_name` text NOT NULL,
	`mime_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`sha256` text NOT NULL,
	`kind` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `attachments_storage_key_unique` ON `attachments` (`storage_key`);--> statement-breakpoint
ALTER TABLE `messages` ADD `attachment_id` text REFERENCES attachments(id);