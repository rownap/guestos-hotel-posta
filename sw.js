// GuestOS Service Worker - Push Notifications & Offline Support

const CACHE_NAME = 'guestos-v1';
const ASSETS_TO_CACHE = [
    '/',
    '/index.html',
    '/common.css',
    '/app.js',
    '/manifest.json',
    '/icons/icon-192x192.png',
    '/icons/icon-512x512.png',
    '/offline.html'
];

// Install Event
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS_TO_CACHE).catch(err => {
                console.log('Cache missing files, continuing anyway', err);
            });
        })
    );
    self.skipWaiting();
});

// Activate Event
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    self.clients.claim();
});

// Fetch Event (Offline Support)
self.addEventListener('fetch', (event) => {
    // Network first for API calls, Cache first for assets
    if (event.request.url.includes('/supabase/') || event.request.url.includes('api')) {
        return;
    }

    event.respondWith(
        caches.match(event.request).then((response) => {
            return response || fetch(event.request).catch(() => {
                // Fallback to offline page for navigation requests
                if (event.request.mode === 'navigate') {
                    return caches.match('/offline.html');
                }
            });
        })
    );
});

// PUSH NOTIFICATION HANDLER 🔔
self.addEventListener('push', (event) => {
    const data = event.data ? event.data.json() : {};

    const title = data.title || 'GuestOS Hotel';
    const options = {
        body: data.body || 'Nuova notifica per te!',
        icon: '/icons/icon-192x192.png',
        badge: '/icons/badge.png',
        vibrate: [100, 50, 100],
        data: {
            url: data.url || '/'
        },
        actions: [
            {
                action: 'view',
                title: 'Vedi Offerta'
            }
        ]
    };

    event.waitUntil(
        self.registration.showNotification(title, options)
    );
});

// NOTIFICATION CLICK HANDLER
self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    const urlToOpen = event.notification.data.url;

    event.waitUntil(
        clients.matchAll({
            type: 'window',
            includeUncontrolled: true
        }).then((windowClients) => {
            // Check if there is already a window/tab open with the target URL
            for (let i = 0; i < windowClients.length; i++) {
                const client = windowClients[i];
                if (client.url === urlToOpen && 'focus' in client) {
                    return client.focus();
                }
            }
            // If not, open a new window
            if (clients.openWindow) {
                return clients.openWindow(urlToOpen);
            }
        })
    );
});
