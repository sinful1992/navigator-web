import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  // IMPORTANT for GitHub Pages under sinful1992/navigator-web
  base: "/navigator-web/",
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "Address Navigator (Web)",
        short_name: "Navigator",
        start_url: "/navigator-web/",
        display: "standalone",
        background_color: "#ffffff",
        theme_color: "#0ea5e9",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
        ]
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,png,svg,ico,webmanifest}"],
        runtimeCaching: [
          {
            // cache same-origin navigations & assets
            urlPattern: ({ sameOrigin }) => sameOrigin,
            handler: "StaleWhileRevalidate",
            options: { cacheName: "static" }
          }
        ]
      }
    })
  ]
});