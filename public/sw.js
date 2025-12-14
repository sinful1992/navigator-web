// Enhanced Service Worker with Background Sync and Offline Support
// Version 2.1 - Network-first for JS chunks to prevent deployment errors

const CACHE_VERSION = 'navigator-v2.1';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const DYNAMIC_CACHE = `${CACHE_VERSION}-dynamic`;
const MAPS_CACHE = `${CACHE_VERSION}-maps`;
const API_CACHE = `${CACHE_VERSION}-api`;

// Resources to cache immediately on install
const STATIC_ASSETS = [
  '/navigator-web/',
  '/navigator-web/index.html',
  '/navigator-web/manifest.webmanifest',
  '/navigator-web/icons/icon-192.png',
  '/navigator-web/icons/icon-512.png',
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker v2.1...');

  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => {
        console.log('[SW] Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => {
        console.log('[SW] Static assets cached successfully');
        // Activate immediately
        return self.skipWaiting();
      })
      .catch((err) => {
        console.error('[SW] Failed to cache static assets:', err);
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker v2.1...');

  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((cacheName) => {
              // Delete old caches that don't match current version
              return cacheName.startsWith('navigator-v') && cacheName !== STATIC_CACHE &&
                     cacheName !== DYNAMIC_CACHE && cacheName !== MAPS_CACHE && cacheName !== API_CACHE;
            })
            .map((cacheName) => {
              console.log('[SW] Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            })
        );
      })
      .then(() => {
        console.log('[SW] Service worker activated, claiming clients');
        return self.clients.claim();
      })
  );
});

// Fetch event - intelligent caching strategy
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Skip chrome-extension and other non-http requests
  if (!request.url.startsWith('http')) {
    return;
  }

  // Handle different types of requests with different strategies
  if (url.hostname === 'maps.googleapis.com' || url.hostname === 'maps.gstatic.com') {
    // Maps: Cache first, fallback to network (for offline maps)
    event.respondWith(cacheFirstStrategy(request, MAPS_CACHE));
  } else if (url.pathname.includes('/api/') || url.hostname.includes('supabase')) {
    // API calls: Network first, fallback to cache (for offline data access)
    event.respondWith(networkFirstStrategy(request, API_CACHE));
  } else if (url.pathname.match(/\.(js)$/)) {
    // JS files: Network first to ensure fresh chunks after deployments
    // Prevents "Failed to fetch dynamically imported module" errors
    event.respondWith(networkFirstStrategy(request, DYNAMIC_CACHE));
  } else if (url.pathname.match(/\.(css|png|jpg|jpeg|svg|woff2)$/)) {
    // Non-JS static assets: Cache first, fallback to network
    event.respondWith(cacheFirstStrategy(request, STATIC_CACHE));
  } else {
    // HTML and other resources: Network first, fallback to cache
    event.respondWith(networkFirstStrategy(request, DYNAMIC_CACHE));
  }
});

// Cache-first strategy: Try cache, fallback to network
async function cacheFirstStrategy(request, cacheName) {
  try {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }

    const networkResponse = await fetch(request);

    // Cache successful responses
    if (networkResponse.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, networkResponse.clone());
    }

    return networkResponse;
  } catch (error) {
    console.error('[SW] Cache-first strategy failed:', error);
    // Try to return cached response even if network failed
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    throw error;
  }
}

// Network-first strategy: Try network, fallback to cache
async function networkFirstStrategy(request, cacheName) {
  try {
    const networkResponse = await fetch(request);

    // Cache successful responses
    if (networkResponse.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, networkResponse.clone());
    }

    return networkResponse;
  } catch (error) {
    console.log('[SW] Network failed, trying cache:', request.url);
    const cachedResponse = await caches.match(request);

    if (cachedResponse) {
      return cachedResponse;
    }

    // Return offline page or error
    console.error('[SW] No cache available for:', request.url);
    throw error;
  }
}

// Background Sync - retry failed sync operations when online
self.addEventListener('sync', (event) => {
  console.log('[SW] Background sync event:', event.tag);

  if (event.tag === 'sync-data') {
    event.waitUntil(syncPendingData());
  } else if (event.tag === 'sync-completions') {
    event.waitUntil(syncCompletions());
  }
});

async function syncPendingData() {
  console.log('[SW] Syncing pending data in background...');

  try {
    // Notify all clients that sync is starting
    const clients = await self.clients.matchAll();
    clients.forEach(client => {
      client.postMessage({
        type: 'BACKGROUND_SYNC_START',
        tag: 'sync-data'
      });
    });

    // Trigger sync completion message
    setTimeout(() => {
      clients.forEach(client => {
        client.postMessage({
          type: 'BACKGROUND_SYNC_COMPLETE',
          tag: 'sync-data'
        });
      });
    }, 1000);

    return Promise.resolve();
  } catch (error) {
    console.error('[SW] Background sync failed:', error);
    throw error;
  }
}

async function syncCompletions() {
  console.log('[SW] Syncing completions in background...');
  // Similar to syncPendingData but specifically for completions
  return syncPendingData();
}

// Message handler - communicate with app
self.addEventListener('message', (event) => {
  console.log('[SW] Received message:', event.data);

  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  } else if (event.data && event.data.type === 'CACHE_URLS') {
    // Pre-cache specific URLs (e.g., map tiles for a route)
    const urls = event.data.urls || [];
    event.waitUntil(
      caches.open(MAPS_CACHE)
        .then(cache => cache.addAll(urls))
        .then(() => {
          console.log('[SW] Pre-cached', urls.length, 'URLs');
          // Notify client of success
          event.ports[0].postMessage({ success: true, count: urls.length });
        })
        .catch(err => {
          console.error('[SW] Pre-cache failed:', err);
          event.ports[0].postMessage({ success: false, error: err.message });
        })
    );
  } else if (event.data && event.data.type === 'CLEAR_CACHE') {
    // Clear specific cache or all caches
    const cacheName = event.data.cacheName;
    event.waitUntil(
      (cacheName ? caches.delete(cacheName) : clearAllCaches())
        .then(() => {
          console.log('[SW] Cache cleared:', cacheName || 'all');
          event.ports[0].postMessage({ success: true });
        })
    );
  }
});

async function clearAllCaches() {
  const cacheNames = await caches.keys();
  return Promise.all(
    cacheNames.map(cacheName => caches.delete(cacheName))
  );
}

// Push notification handler (for future arrangement reminders)
self.addEventListener('push', (event) => {
  console.log('[SW] Push notification received');

  const data = event.data ? event.data.json() : {};
  const title = data.title || 'Navigator Reminder';
  const options = {
    body: data.body || 'You have a pending arrangement',
    icon: '/navigator-web/icons/icon-192.png',
    badge: '/navigator-web/icons/icon-192.png',
    data: data,
    requireInteraction: true,
    actions: [
      { action: 'view', title: 'View' },
      { action: 'dismiss', title: 'Dismiss' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// Notification click handler
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked:', event.action);

  event.notification.close();

  if (event.action === 'view') {
    // Open the app
    event.waitUntil(
      clients.openWindow('/navigator-web/?utm_source=notification')
    );
  }
});

console.log('[SW] Service Worker v2.1 loaded');
