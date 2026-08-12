import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";

const outDir = fileURLToPath(new URL("../dist/client", import.meta.url));

function injectServiceWorkerPrecache(): Plugin {
  return {
    name: "lirna-service-worker-precache",
    apply: "build",
    async closeBundle() {
      const index = await readFile(`${outDir}/index.html`, "utf8");
      const assets = [...index.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)]
        .map((match) => match[1]!)
        .sort();
      const serviceWorkerPath = `${outDir}/service-worker.js`;
      const serviceWorker = await readFile(serviceWorkerPath, "utf8");
      await writeFile(
        serviceWorkerPath,
        serviceWorker.replace("self.__LIRNA_PRECACHE__", JSON.stringify(assets)),
      );
    },
  };
}

// The client is a standalone SPA. It is built to dist/client and served, as
// static assets, by the hosted Hono API; routing stays a browser concern and
// never couples to the backend.
export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [react(), tailwindcss(), injectServiceWorkerPrecache()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  build: {
    outDir,
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
