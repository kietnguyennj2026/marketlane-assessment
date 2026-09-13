CREATE TABLE `inventory` (
	`session_id` text NOT NULL,
	`product_id` text NOT NULL,
	`stock` integer NOT NULL,
	PRIMARY KEY(`session_id`, `product_id`),
	FOREIGN KEY (`session_id`) REFERENCES `demo_sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "stock_nonnegative" CHECK("inventory"."stock" >= 0)
);
--> statement-breakpoint
CREATE TABLE `orders` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`request_key` text NOT NULL,
	`fingerprint` text NOT NULL,
	`status` text NOT NULL,
	`provider` text NOT NULL,
	`payment_id` text,
	`checkout_url` text,
	`total` integer NOT NULL,
	`lines` text NOT NULL,
	`allocations` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `demo_sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "order_status" CHECK("orders"."status" IN ('pending','paid','declined','expired'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `orders_session_request` ON `orders` (`session_id`,`request_key`);--> statement-breakpoint
CREATE INDEX `orders_session_created` ON `orders` (`session_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `demo_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL
);
