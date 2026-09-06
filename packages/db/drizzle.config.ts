import { defineConfig } from "drizzle-kit";
import { loadRootEnv } from "./src/env.ts";

loadRootEnv(import.meta.url, 2);

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is missing. Copy .env.example to .env.");
}

export default defineConfig({
  schema: "./src/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
