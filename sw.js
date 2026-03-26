const CACHE_NAME = 'school-pro-plus-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/manifest.json'
];

// Install event: cache core assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE))
  );
});

// Fetch event: Network first, fallback to cache
self.addEventListener('fetch', (event) => {
  // Do not intercept API POST calls to Google Apps Script
  if (event.request.method === 'POST') return;
  
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});