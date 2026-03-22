const CACHE = 'nymbus-v4';

// Only cache JS files — HTML always fetched fresh from network
const PRECACHE = ['/app.js', '/calendar.js'];

self.addEventListener('install', e => {
    e.waitUntil(
        caches.open(CACHE).then(c => c.addAll(PRECACHE).catch(() => {}))
    );
    self.skipWaiting();
});

self.addEventListener('activate', e => {
    e.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.map(k => caches.delete(k))) // delete ALL old caches
        ).then(() => caches.open(CACHE))
    );
    self.clients.claim();
});

self.addEventListener('fetch', e => {
    const url = new URL(e.request.url);

    // Only handle http/https GET requests
    if (!url.protocol.startsWith('http')) return;
    if (e.request.method !== 'GET') return;

    // Always fetch HTML fresh from network — never serve stale HTML
    if (url.pathname.endsWith('.html') || !url.pathname.includes('.')) return;

    // Never intercept API calls
    if (url.pathname.startsWith('/applications')) return;

    // Network-first for JS files
    e.respondWith(
        fetch(e.request)
            .then(res => {
                const clone = res.clone();
                caches.open(CACHE).then(c => c.put(e.request, clone));
                return res;
            })
            .catch(() => caches.match(e.request))
    );
});
