// src/main.tsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";


// --- PWA registration ---
import { registerSW } from "virtual:pwa-register";
registerSW({
  immediate: true,
  onOfflineReady() {
    console.log("PWA ready to work offline.");
  }
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
