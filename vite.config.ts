// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// No PWA plugin needed. We ship a static manifest + service worker in /public.
export default defineConfig({
  // GitHub Pages serves the app at /navigator-web/
  base: "/navigator-web/",
  plugins: [react()],
});