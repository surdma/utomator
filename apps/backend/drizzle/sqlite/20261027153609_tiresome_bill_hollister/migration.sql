CREATE TABLE `utomator_documents` (
	`owner_id` text NOT NULL,
	`namespace` text NOT NULL,
	`record_key` text NOT NULL,
	`version` integer NOT NULL,
	`payload` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT `utomator_documents_pk` PRIMARY KEY(`owner_id`, `namespace`, `record_key`)
);
