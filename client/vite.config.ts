import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

// The client is a standalone SPA. It is built to dist/client and served, as
// static assets, by the hosted Hono API; routing stays a browser concern and
// never couples to the backend.
export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  build: {
    outDir: fileURLToPath(new URL("../dist/client", import.meta.url)),
    emptyOutDir: true,
  },
  server: {
    // In development the Vite dev server owns the client and proxies the API
    // to the hosted Hono backend.
    proxy: {
      "/api": "http://localhost:3000",
    },
  },
});
