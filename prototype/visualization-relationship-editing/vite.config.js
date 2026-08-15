import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  base: "./",
  build: {
    emptyOutDir: true,
    outDir: "embed",
    rollupOptions: {
      input: resolve(import.meta.dirname, "excalidraw.html"),
    },
  },
});
