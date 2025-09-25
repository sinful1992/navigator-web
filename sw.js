// public/sw.js
// Minimal service worker to satisfy installability.
// (No caching yet; you can add Workbox later if you want.)

self.addEventListener("install", (event) => {
  // Activate the new SW immediately
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  // Claim control so the page becomes controlled without reload
  self.clients.claim();
});

// Pass-through fetch (no offline caching in this minimal version)
self.addEventListener("fetch", () => {});