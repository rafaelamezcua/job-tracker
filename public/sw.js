const CACHE = 'nymbus-v3';
const OFFLINE_ASSETS = ['/', '/dashboard', '/login', '/app.js', '/calendar.js'];

self.addEventListener('install', e => {
    e.waitUntil(
        caches.open(CACHE).then(c => c.addAll(OFFLINE_ASSETS).catch(() => {}))
    );
    self.skipWaiting();
});

self.addEventListener('activate', e => {
    e.waitUntil(caches.keys().then(keys =>
        Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ));
    self.clients.claim();
});

self.addEventListener('fetch', e => {
    const url = new URL(e.request.url);

    // Only handle http/https — ignore chrome-extension and other schemes
    if (!url.protocol.startsWith('http')) return;

    // Never intercept API calls
    if (e.request.method !== 'GET') return;
    if (url.pathname.startsWith('/applications')) return;

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
