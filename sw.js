// Mio — Service Worker

const CACHE = 'mio-v2';
const ASSETS = [
'./',
'./index.html',
'./manifest.json',
'./css/style.css',
'./js/app.js',
'./js/prompts.js',
'./js/llm.js',
'./js/voice.js',
'./js/memory.js',
'./js/tools.js'
];

self.addEventListener('install', (e) => {
e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS).catch(() => {})));
self.skipWaiting();
});

self.addEventListener('activate', (e) => {
e.waitUntil(
caches.keys().then(keys =>
Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
)
);
self.clients.claim();
});

self.addEventListener('fetch', (e) => {
if (e.request.method !== 'GET') return;
if (e.request.url.includes('api.groq.com')) return;
if (e.request.url.includes('fonts.googleapis.com')) return;
if (e.request.url.includes('fonts.gstatic.com')) return;

e.respondWith(
caches.match(e.request).then(cached => cached || fetch(e.request).catch(() => cached))
);
});
