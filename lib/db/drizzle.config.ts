import { defineConfig } from "drizzle-kit";
import path from "path";

const databaseUrl = process.env.SUPABASE_DATABASE_URL ?? process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("A database connection must be configured");
}

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  dialect: "postgresql",
  dbCredentials: {
    url: databaseUrl.includes("sslmode=") ? databaseUrl : `${databaseUrl}?sslmode=require`,
  },
});
