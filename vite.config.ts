// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// Change this to your repository name if different
const repo = "navigator-web";
const base = `/${repo}/`;

export default defineConfig({
  base, // required for GitHub Pages (served from /<repo>/)
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      devOptions: { enabled: false },
      includeAssets: [
        "icons/icon-192.png",
        "icons/icon-512.png",
        "favicon.ico",
        "apple-touch-icon.png"
      ],
      manifest: {
        name: "Address Navigator (Web)",
        short_name: "Navigator",
        start_url: base,
        scope: base,
        display: "standalone",
        background_color: "#ffffff",
        theme_color: "#0ea5e9",
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" }
        ]
      },
      workbox: {
        // Cache the built assets + HTML + manifest
        globPatterns: ["**/*.{js,css,html,ico,png,svg,webmanifest}"]
      }
    })
  ],
  build: {
    outDir: "dist",
    sourcemap: false,
    // Optional: raise this if you want to silence big bundle warnings
    // chunkSizeWarningLimit: 1200,
  },
  server: {
    port: 5173
  },
  preview: {
    port: 4173
  }
});
