// src/main.tsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

/**
 * Warm up the connection to Supabase to reduce first-RPC latency.
 * Adds <link rel="preconnect"> and <link rel="dns-prefetch"> to the document head.
 */
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
if (supabaseUrl) {
  try {
    const origin = new URL(supabaseUrl).origin;
    (["preconnect", "dns-prefetch"] as const).forEach((rel) => {
      const link = document.createElement("link");
      link.rel = rel;
      link.href = origin;
      if (rel === "preconnect") {
        // empty string enables anonymous CORS per spec
        link.crossOrigin = "";
      }
      document.head.appendChild(link);
    });
  } catch {
    // ignore invalid URL or DOM issues
  }
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
