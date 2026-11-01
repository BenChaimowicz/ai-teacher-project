import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";

/** API origin for the dev proxy. E2E runs point this at its own API port. */
const apiUrl = process.env.API_URL ?? "http://127.0.0.1:3000";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    // Keep the browser's Host: the API builds sign-in email links from it (ADR 0027). The string shorthand would turn
    // on changeOrigin and rewrite Host to the API's own port, so links would point at the API instead of this server.
    proxy: {
      "/api": { target: apiUrl, changeOrigin: false },
      "/media": { target: apiUrl, changeOrigin: false },
    },
  },
});
