/*
 * GuestOS — Service Worker unico (PWA + Web Push)
 *
 * Strategie:
 *  - Navigazioni HTML: network-first → cache → offline.html
 *  - Asset statici same-origin (css/js/immagini/font/manifest): cache-first
 *  - Bypass totale (nessun intercept): supabase.co, /api/, stripe, weatherwidget,
 *    qualsiasi richiesta non-GET, estensioni browser
 *  - Precache tollerante: ogni file viene aggiunto singolarmente; un 404 non
 *    blocca l'installazione (era la causa per cui il vecchio SW non si installava).
 *  - Versione cache `guestos-v2`: all'activate le cache precedenti vengono eliminate.
 */

const CACHE_NAME = 'guestos-v2';

const PRECACHE_URLS = [
    '/',
    '/index.html',
    '/offline.html',
    '/common.css',
    '/app.js',
    '/manifest.json',
    '/bottom-nav.html',
    '/assets/icon-192.png',
    '/assets/icon-512.png'
];

const BYPASS_HOST_PATTERNS = [
    'supabase.co',
    'supabase.in',
    'stripe.com',
    'stripe.network',
    'weatherwidget.io',
    'anthropic.com'
];

const STATIC_DESTINATIONS = new Set(['style', 'script', 'image', 'font', 'manifest']);
const STATIC_EXT_RE = /\.(css|js|mjs|png|jpg|jpeg|gif|webp|svg|ico|woff2?|ttf|otf|mp3|json)$/i;

// ---------------------------------------------------------------------------
// INSTALL — precache tollerante
// ---------------------------------------------------------------------------
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) =>
            Promise.all(
                PRECACHE_URLS.map((url) =>
                    cache.add(url).catch((err) => {
                        // Non bloccare l'installazione per un singolo file mancante
                        console.warn('[SW] precache saltato:', url, err && err.message);
                    })
                )
            )
        ).then(() => self.skipWaiting())
    );
});

// ---------------------------------------------------------------------------
// ACTIVATE — pulizia cache vecchie
// ---------------------------------------------------------------------------
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(
                keys
                    .filter((key) => key !== CACHE_NAME)
                    .map((key) => caches.delete(key))
            ))
            .then(() => self.clients.claim())
    );
});

// ---------------------------------------------------------------------------
// FETCH
// ---------------------------------------------------------------------------
function shouldBypass(request, url) {
    if (request.method !== 'GET') return true;
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return true; // chrome-extension:, data:, ...
    if (url.origin === self.location.origin) {
        if (url.pathname.startsWith('/api/')) return true;
        return false;
    }
    // Cross-origin: bypass per i servizi "vivi"; le CDN (font, supabase-js, ecc.)
    // vengono lasciate al browser (niente caching SW per non servire versioni stantie).
    return true;
}

function isNavigation(request) {
    return request.mode === 'navigate' ||
        (request.headers.get('accept') || '').includes('text/html');
}

function isStaticAsset(request, url) {
    if (STATIC_DESTINATIONS.has(request.destination)) return true;
    return STATIC_EXT_RE.test(url.pathname);
}

async function networkFirstNavigation(request) {
    try {
        const response = await fetch(request);
        if (response && response.ok) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, response.clone()).catch(() => { /* quota */ });
        }
        return response;
    } catch (err) {
        const cached = await caches.match(request, { ignoreSearch: true });
        if (cached) return cached;
        const offline = await caches.match('/offline.html');
        if (offline) return offline;
        return new Response('<h1>Offline</h1>', {
            status: 503,
            headers: { 'Content-Type': 'text/html; charset=utf-8' }
        });
    }
}

async function cacheFirst(request) {
    const cached = await caches.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response && response.ok && response.type === 'basic') {
        const cache = await caches.open(CACHE_NAME);
        cache.put(request, response.clone()).catch(() => { /* quota */ });
    }
    return response;
}

self.addEventListener('fetch', (event) => {
    const request = event.request;
    let url;
    try {
        url = new URL(request.url);
    } catch (e) {
        return;
    }

    // Bypass: supabase, /api/, stripe, weatherwidget, non-GET, cross-origin
    if (shouldBypass(request, url)) return;
    for (const pattern of BYPASS_HOST_PATTERNS) {
        if (url.hostname.includes(pattern)) return;
    }

    if (isNavigation(request)) {
        event.respondWith(networkFirstNavigation(request));
        return;
    }

    if (isStaticAsset(request, url)) {
        event.respondWith(cacheFirst(request));
        return;
    }
    // Tutto il resto: rete diretta (nessun respondWith)
});

// ---------------------------------------------------------------------------
// WEB PUSH
// ---------------------------------------------------------------------------
self.addEventListener('push', (event) => {
    let data = {};
    try {
        data = event.data ? event.data.json() : {};
    } catch (e) {
        data = { body: event.data ? event.data.text() : '' };
    }

    const title = data.title || 'GuestOS';
    const options = {
        body: data.body || 'Nuova notifica per te',
        icon: '/assets/icon-192.png',
        badge: '/assets/icon-192.png',
        vibrate: [100, 50, 100],
        tag: data.tag || 'guestos',
        renotify: Boolean(data.tag),
        data: { url: data.url || '/' },
        actions: [{ action: 'view', title: data.action_title || 'Apri' }]
    };

    event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    const rawUrl = (event.notification.data && event.notification.data.url) || '/';
    // Solo URL same-origin: evita di aprire link esterni arbitrari da un payload push
    let target;
    try {
        target = new URL(rawUrl, self.location.origin);
        if (target.origin !== self.location.origin) target = new URL('/', self.location.origin);
    } catch (e) {
        target = new URL('/', self.location.origin);
    }
    const urlToOpen = target.href;

    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
            for (const client of windowClients) {
                if (client.url === urlToOpen && 'focus' in client) {
                    return client.focus();
                }
            }
            if (windowClients.length > 0 && 'navigate' in windowClients[0]) {
                return windowClients[0].focus().then((c) => c.navigate(urlToOpen)).catch(() => self.clients.openWindow(urlToOpen));
            }
            if (self.clients.openWindow) {
                return self.clients.openWindow(urlToOpen);
            }
        })
    );
});

// Consente alla pagina di forzare l'aggiornamento: reg.waiting.postMessage({type:'SKIP_WAITING'})
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});
