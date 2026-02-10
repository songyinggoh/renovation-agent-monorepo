CREATE TABLE "room_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"room_id" uuid NOT NULL,
	"asset_type" text NOT NULL,
	"storage_path" text NOT NULL,
	"source" text DEFAULT 'user_upload' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"original_filename" text NOT NULL,
	"content_type" text NOT NULL,
	"file_size" integer NOT NULL,
	"display_order" integer DEFAULT 0,
	"caption" text,
	"alt_text" text,
	"uploaded_by" uuid,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "room_assets" ADD CONSTRAINT "room_assets_session_id_renovation_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."renovation_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_assets" ADD CONSTRAINT "room_assets_room_id_renovation_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."renovation_rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_assets" ADD CONSTRAINT "room_assets_uploaded_by_profiles_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_room_assets_session" ON "room_assets" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "idx_room_assets_room" ON "room_assets" USING btree ("room_id");--> statement-breakpoint
CREATE INDEX "idx_room_assets_type" ON "room_assets" USING btree ("room_id","asset_type");