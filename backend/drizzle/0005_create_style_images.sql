CREATE TABLE IF NOT EXISTS "style_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"style_id" uuid NOT NULL,
	"storage_path" text NOT NULL,
	"filename" text NOT NULL,
	"content_type" text DEFAULT 'image/jpeg' NOT NULL,
	"file_size" integer,
	"width" integer,
	"height" integer,
	"caption" text,
	"alt_text" text,
	"room_type" text,
	"tags" jsonb,
	"display_order" integer DEFAULT 0,
	"source_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "style_images_storage_path_unique" UNIQUE("storage_path")
);
--> statement-breakpoint
ALTER TABLE "style_images" ADD CONSTRAINT "style_images_style_id_style_catalog_id_fk" FOREIGN KEY ("style_id") REFERENCES "public"."style_catalog"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_style_images_style" ON "style_images" USING btree ("style_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_style_images_room_type" ON "style_images" USING btree ("style_id","room_type");
