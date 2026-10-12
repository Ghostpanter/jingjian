import { rmSync } from "node:fs";
import path from "node:path";
import { defineConfig, type Plugin } from "vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// public/__grok is the web install page (PWA icons, screenshots). The Android
// and desktop apps never load it, so keep it out of the package.
function dropWebInstallAssets(): Plugin {
  return {
    name: "jingjian-drop-web-install-assets",
    apply: "build",
    closeBundle() {
      rmSync(path.resolve("android-www/__grok"), { recursive: true, force: true });
    },
  };
}

export default defineConfig({
  root: path.resolve("android-web"),
  // Relative URLs so Electron file:// and Capacitor both resolve assets.
  base: "./",
  publicDir: path.resolve("public"),
  plugins: [viteReact(), tailwindcss(), dropWebInstallAssets()],
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
