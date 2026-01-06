import type { Config } from "drizzle-kit";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env" });

// Build direct connection string from Supabase URL
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabasePassword = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
	throw new Error('NEXT_PUBLIC_SUPABASE_URL is required');
}

// Extract project reference from Supabase URL
const projectRef = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];

if (!projectRef) {
	throw new Error('Invalid NEXT_PUBLIC_SUPABASE_URL format');
}

// Build direct database connection string
const connectionString = supabasePassword
	? `postgresql://postgres:${supabasePassword}@db.${projectRef}.supabase.co:5432/postgres`
	: undefined;

if (!connectionString) {
	throw new Error('Unable to build database connection string. Check SUPABASE_SERVICE_ROLE_KEY.');
}

export default {
	schema: "./src/models/schema.model.ts",
	out: "./drizzle",
	dialect: "postgresql",
	dbCredentials: {
		url: connectionString,
	},
} satisfies Config;
