CREATE TABLE "style_catalog" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text NOT NULL,
	"color_palette" jsonb NOT NULL,
	"materials" jsonb NOT NULL,
	"keywords" jsonb NOT NULL,
	"image_urls" jsonb,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "style_catalog_name_unique" UNIQUE("name"),
	CONSTRAINT "style_catalog_slug_unique" UNIQUE("slug")
);
