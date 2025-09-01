// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// GITHUB_REPOSITORY looks like "sinful1992/navigator-web"
const repoFull = process.env.GITHUB_REPOSITORY ?? "";
const [owner, repo] = repoFull.split("/");
const isUserSite = repo?.toLowerCase() === `${owner?.toLowerCase()}.github.io`;

// For https://sinful1992.github.io/navigator-web/ we want "/navigator-web/"
const base = isUserSite ? "/" : `/${repo ?? ""}/`;

export default defineConfig({
  plugins: [react()],
  base,
});
