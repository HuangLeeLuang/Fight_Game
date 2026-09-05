const CACHE_NAME = 'fight-game-offline-v6';
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png',
  './assets/audio/block.wav',
  './assets/audio/block.ogg',
  './assets/audio/counter.wav',
  './assets/audio/counter.ogg',
  './assets/audio/hit.wav',
  './assets/audio/hit.ogg',
  './assets/audio/parry.wav',
  './assets/audio/parry.ogg',
  './assets/audio/throw.wav',
  './assets/audio/throw.ogg',
  './assets/characters/female-striker.png',
  './assets/characters/male-soldier.png',
  './assets/characters/sheets/female-actions-v3-key.png',
  './assets/characters/sheets/female-actions-v3-inbetween-a.png',
  './assets/characters/sheets/female-actions-v3-inbetween-b.png',
  './assets/characters/sheets/male-actions-v3-key.png',
  './assets/characters/sheets/male-actions-v3-inbetween-a.png',
  './assets/characters/sheets/male-actions-v3-inbetween-b.png'
];

const scopeUrl = (path) => new URL(path, self.registration.scope).toString();

async function cacheRequest(cache, url) {
  try {
    const request = new Request(url, { cache: 'reload' });
    const response = await fetch(request);
    if (response.ok) {
      await cache.put(request, response.clone());
      return response;
    }
  } catch (_error) {
    return undefined;
  }
  return undefined;
}

async function cacheBuiltAssets(cache) {
  const response = await cacheRequest(cache, scopeUrl('./'));
  if (!response) return;

  const html = await response.text();
  const refs = [...html.matchAll(/\b(?:href|src)=["']([^"']+)["']/g)]
    .map((match) => match[1])
    .filter((value) => value && !value.startsWith('data:') && !value.startsWith('http'))
    .map((value) => new URL(value, self.registration.scope).toString());

  await Promise.allSettled([...new Set(refs)].map((url) => cacheRequest(cache, url)));
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.allSettled(CORE_ASSETS.map((asset) => cacheRequest(cache, scopeUrl(asset))));
    await cacheBuiltAssets(cache);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch (_error) {
    return (await cache.match(request)) || (await cache.match(scopeUrl('./'))) || Response.error();
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
    return;
  }

  event.respondWith(cacheFirst(request));
});
