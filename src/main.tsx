// src/main.tsx
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

/**
 * Global error handler to trace DOM manipulation errors
 */
window.addEventListener('error', (event) => {
  if (event.error instanceof DOMException && event.error.name === 'NotFoundError') {
    console.error('🔴 DOM NotFoundError detected:', {
      message: event.error.message,
      stack: event.error.stack,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      timestamp: new Date().toISOString()
    });

    // Try to get more context about the error
    if (event.error.stack) {
      console.error('🔍 Full stack trace:', event.error.stack);
    }
  }
});

// Also catch unhandled promise rejections
window.addEventListener('unhandledrejection', (event) => {
  if (event.reason instanceof DOMException && event.reason.name === 'NotFoundError') {
    console.error('🔴 Unhandled DOM NotFoundError:', {
      reason: event.reason.message,
      stack: event.reason.stack,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Temporary DOM method instrumentation to trace removeChild errors
 */
if (typeof Node !== 'undefined' && Node.prototype.removeChild) {
  const originalRemoveChild = Node.prototype.removeChild;
  Node.prototype.removeChild = function(child) {
    try {
      // Log the operation attempt
      console.debug('🔧 removeChild called:', {
        parent: this.nodeName || this.constructor.name,
        child: child.nodeName || child.constructor.name,
        parentContainsChild: this.contains(child),
        childParentNode: child.parentNode === this ? 'matches' : 'different',
        timestamp: new Date().toISOString()
      });

      return originalRemoveChild.call(this, child);
    } catch (error) {
      console.error('🔴 removeChild failed:', {
        error: error.message,
        parent: this.nodeName || this.constructor.name,
        child: child.nodeName || child.constructor.name,
        parentContainsChild: this.contains ? this.contains(child) : 'unknown',
        childParentNode: child.parentNode === this ? 'matches' : 'different',
        stack: error.stack,
        timestamp: new Date().toISOString()
      });
      throw error;
    }
  };
}

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
  <App />
);
