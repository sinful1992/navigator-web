// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "Address Navigator (web)",
        short_name: "Navigator",
        start_url: ".",
        display: "standalone",
        background_color: "#ffffff",
        theme_color: "#eaeaea",
        // IMPORTANT: no leading slash; files live in public/icons/
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
        ]
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,png,svg,ico,webmanifest}"],
        runtimeCaching: [
          {
            // cache same-origin static assets
            urlPattern: ({ sameOrigin }) => sameOrigin,
            handler: "StaleWhileRevalidate",
            options: { cacheName: "static" }
          }
        ]
      }
    })
  ],
  // REQUIRED for GitHub Pages under /navigator-web/
  base: "/navigator-web/",
});
