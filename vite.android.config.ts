import path from "node:path";
import { defineConfig } from "vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  root: path.resolve("android-web"),
  // Relative URLs so Electron file:// and Capacitor both resolve assets.
  base: "./",
  publicDir: path.resolve("public"),
  plugins: [viteReact(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve("src"),
    },
  },
  build: {
    outDir: path.resolve("android-www"),
    emptyOutDir: true,
    sourcemap: false,
    assetsDir: "assets",
  },
});
