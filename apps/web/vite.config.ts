import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";

/** API origin for the dev proxy. E2E runs point this at its own API port. */
const apiUrl = process.env.API_URL ?? "http://127.0.0.1:3000";

/** The repo root, two levels up, where the one `.env` lives. */
const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

export default defineConfig(({ mode }) => {
  // Only these two values reach the browser. Both are public by design: the publishable key is meant for clients.
  // The rest of the root `.env` (database URL, secret keys) stays on the server side.
  const env = loadEnv(mode, repoRoot, "");
  const supabaseUrl = env.SUPABASE_URL ?? "";
  const supabaseKey = env.SUPABASE_PUBLISHABLE_KEY ?? "";
  if (!supabaseUrl || !supabaseKey) {
    console.warn("[vite.config.ts] SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY is missing from the root .env; sign-in will not work.");
  }

  return {
    plugins: [react(), tailwindcss()],
    define: {
      __SUPABASE_URL__: JSON.stringify(supabaseUrl),
      __SUPABASE_PUBLISHABLE_KEY__: JSON.stringify(supabaseKey),
    },
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url)),
      },
    },
    server: {
      host: "127.0.0.1",
      port: 5173,
      proxy: {
        "/api": apiUrl,
        "/media": apiUrl,
      },
    },
  };
});
