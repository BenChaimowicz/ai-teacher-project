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
    // The "API traffic" screen lives at /api too (Logs links deep-link to /api?requestId=…), so a page load of it, which
    // asks for HTML, is served by Vite; the screens' own fetches (JSON) go to the console server.
    proxy: {
      "/api": {
        target: consoleApiUrl,
        bypass: (request) => (request.headers.accept?.includes("text/html") ? request.url : undefined),
      },
    },
  },
});
