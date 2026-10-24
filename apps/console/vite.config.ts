import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";

/** The Usage Console's own API (src/server), not the Learner API. */
const consoleApiUrl = process.env.CONSOLE_API_URL ?? `http://127.0.0.1:${process.env.CONSOLE_API_PORT ?? 3100}`;

export default defineConfig({
  root: "src/web",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src/web", import.meta.url)),
    },
  },
  build: { outDir: fileURLToPath(new URL("./dist", import.meta.url)), emptyOutDir: true },
  server: {
    host: "127.0.0.1",
    port: 5174,
    proxy: { "/api": consoleApiUrl },
  },
});
