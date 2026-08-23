import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { VitePWA } from "vite-plugin-pwa";

function katexWoff2Only(): Plugin {
  return {
    enforce: "pre",
    name: "katex-woff2-only",
    transform(source, id) {
      if (!id.endsWith("/katex/dist/katex.min.css")) return;
      return source.replace(
        /,url\([^)]*\.woff\)\s*format\(["']woff["']\),url\([^)]*\.ttf\)\s*format\(["']truetype["']\)/g,
        "",
      );
    },
  };
}

export default defineConfig({
  server: {
    strictPort: true,
  },
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [
    katexWoff2Only(),
    tailwindcss(),
    tanstackRouter({
      target: "react",
      autoCodeSplitting: true,
    }),
    react(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "Lirna",
        short_name: "Lirna",
        description: "Lirna - PWA Application",
        theme_color: "#0c0c0c",
      },
      pwaAssets: { disabled: false, config: true },
      devOptions: { enabled: true },
    }),
  ],
});
