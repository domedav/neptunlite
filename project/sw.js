/**
 * Neptun-Lite V2 Service Worker
 * Offline caching with fallback page and notification support
 */

const CACHE_VERSION = 'v2';
const STATIC_CACHE = `neptun-lite-static-${CACHE_VERSION}`;
const DATA_CACHE = `neptun-lite-data-${CACHE_VERSION}`;

// Assets to cache immediately (App Shell)
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/offline.html',
    '/styles.css',
    '/app.js',
    '/db.js',
    '/ics-parser.js',
    '/manifest.json',
    '/icons/icon-512.webp',
    '/icons/icon-192.webp',
    '/favicon.png'
];

// Install event - cache app shell
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(STATIC_CACHE)
            .then((cache) => cache.addAll(STATIC_ASSETS))
            .then(() => self.skipWaiting())
            .catch((error) => console.error('[SW] Cache failed:', error))
    );
});

// Activate event - clean old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((cacheNames) => {
                return Promise.all(
                    cacheNames
                        .filter((name) => {
                            return name.startsWith('neptun-lite-') && 
                                   name !== STATIC_CACHE && 
                                   name !== DATA_CACHE;
                        })
                        .map((name) => caches.delete(name))
                );
            })
            .then(() => self.clients.claim())
    );
});

// Fetch event - Network First for ICS, Cache First for static assets
self.addEventListener('fetch', (event) => {
    const { request } = event;
    
    if (request.method !== 'GET') return;
    
    const url = new URL(request.url);
    if (!url.protocol.startsWith('http')) return;
    
    // Check if this is an ICS/calendar request
    const isICSRequest = url.pathname.endsWith('.ics') || 
                         request.headers.get('Accept')?.includes('text/calendar');
    
    if (isICSRequest) {
        event.respondWith(networkFirstStrategy(request));
    } else {
        event.respondWith(cacheFirstStrategy(request));
    }
});

/**
 * Cache First Strategy (static assets)
 */
async function cacheFirstStrategy(request) {
    const cachedResponse = await caches.match(request);
    
    if (cachedResponse) {
        // Update in background
        fetch(request).then((response) => {
            if (response && response.status === 200) {
                caches.open(STATIC_CACHE).then((cache) => {
                    cache.put(request, response);
                });
            }
        }).catch(() => {});
        
        return cachedResponse;
    }
    
    try {
        const response = await fetch(request);
        
        if (response && response.status === 200) {
            const cache = await caches.open(STATIC_CACHE);
            cache.put(request, response.clone());
        }

        return response;
    } catch (error) {
        // For navigation requests, serve offline page
        if (request.destination === 'document' || request.mode === 'navigate') {
            const offlinePage = await caches.match('/offline.html');
            if (offlinePage) {
                return offlinePage;
            }
            return caches.match('/index.html');
        }

        return new Response('Offline', { 
            status: 503,
            headers: { 'Content-Type': 'text/plain' }
        });
    }
}

/**
 * Network First Strategy (ICS data)
 */
async function networkFirstStrategy(request) {
    try {
        const response = await fetch(request);

        if (response && response.status === 200) {
            const cache = await caches.open(DATA_CACHE);
            cache.put(request, response.clone());
        }

        return response;
    } catch (error) {
        const cachedResponse = await caches.match(request);

        if (cachedResponse) {
            return cachedResponse;
        }

        return new Response(JSON.stringify({
            error: 'Offline',
            message: 'No cached data available'
        }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}

/**
 * Notification click handler
 */
self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    // Open the app when notification is clicked
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then((windowClients) => {
                // If there's already a window open, focus it
                if (windowClients.length > 0) {
                    return windowClients[0].focus();
                }
                // Otherwise, open a new window
                return clients.openWindow(event.notification.data?.url || '/');
            })
    );
});
