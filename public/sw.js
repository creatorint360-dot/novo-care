'use strict';
// Service worker: lets this app install like an app and open its screens
// quickly. It stores ONLY the page files (HTML, CSS, JS, icons).
// It never stores anything from /api, so no patient or staff data is kept on the phone.
const CACHE = 'novo-staff-shell-v4';
const SHELL = ['/', '/style.css', '/app.js', '/favicon.svg', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  // Network first (always the newest version), the saved copy only when offline.
  event.respondWith(
    fetch(event.request).then((res) => {
      const copy = res.clone();
      if (res.ok) caches.open(CACHE).then((c) => c.put(event.request, copy));
      return res;
    }).catch(() => caches.match(event.request).then((hit) => hit || caches.match('/')))
  );
});
